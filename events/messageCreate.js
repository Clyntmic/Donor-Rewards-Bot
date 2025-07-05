import { Events } from "discord.js"
import { getDatabase, saveDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"
import { CONFIG } from "../config.js"
import fetch from "node-fetch"

export const name = Events.MessageCreate

export async function execute(message) {
  if (message.author.bot) return

  // Check for tip.cc donations
  if (message.author.id === "617037497574359050") {
    // tip.cc bot ID
    await handleTipccDonation(message)
  }
}

async function handleTipccDonation(message) {
  try {
    const serverId = message.guildId
    if (!serverId) return

    const db = getDatabase(serverId)

    // Parse tip.cc message - try multiple regex patterns
    let match = null
    let sender, amount, currency, recipient

    // Pattern 1: Custom emoji format - <a:USDT:123> <@!123> sent <@123> 0.1000 USDT (≈ $0.10).
    const tipRegex1 = /<[a:]*\w+:\d+>\s*<@!?(\d+)>\s*sent\s*<@!?(\d+)>\s*([\d.]+)\s*(\w+)/i
    match = message.content.match(tipRegex1)
    
    if (match) {
      sender = match[1] // sender user ID
      recipient = match[2] // recipient user ID  
      amount = match[3]
      currency = match[4]
    }

    if (!match) {
      // Pattern 2: Username format - username sent amount currency to recipient
      const tipRegex2 = /(\w+)\s*sent\s*([\d.]+)\s*(\w+)\s*to\s*(\w+)/i
      match = message.content.match(tipRegex2)
      if (match) {
        [, sender, amount, currency, recipient] = match
      }
    }

    if (!match) {
      // Pattern 3: Standard tip.cc format with bold
      const tipRegex3 = /💰\s*\*\*(.+?)\*\*\s*sent\s*\*\*(.+?)\s*(.+?)\*\*\s*to\s*\*\*(.+?)\*\*/i
      match = message.content.match(tipRegex3)
      if (match) {
        [, sender, amount, currency, recipient] = match
      }
    }

    if (!match) {
      logger.debug(`🔍 No tip match found in message: ${message.content}`)
      return
    }

    logger.info(`🔍 Detected tip: ${sender} sent ${amount} ${currency} to ${recipient}`)

    // Check if recipient is in allowed recipients
    if (!db.config?.allowedRecipients?.length) {
      logger.info("🔍 No allowed recipients configured")
      return
    }

    // More flexible recipient matching - handle both user IDs and usernames
    let isAllowedRecipient = false
    
    // If recipient is a user ID, try to get the username from the guild
    let recipientToCheck = recipient
    if (/^\d+$/.test(recipient)) {
      // It's a user ID, try to get the member
      try {
        const member = await message.guild.members.fetch(recipient)
        if (member) {
          recipientToCheck = member.user.username
          logger.debug(`🔍 Converted user ID ${recipient} to username: ${recipientToCheck}`)
        }
      } catch (error) {
        logger.debug(`🔍 Could not fetch member for ID ${recipient}`)
      }
    }
    
    // Check against allowed recipients
    const cleanRecipient = recipientToCheck.replace(/[@<>!]/g, '').toLowerCase()
    logger.debug(`🔍 Checking recipient: ${cleanRecipient} against allowed list: ${JSON.stringify(db.config.allowedRecipients)}`)
    
    isAllowedRecipient = db.config.allowedRecipients.some((allowed) => {
      if (typeof allowed !== 'string') return false
      const cleanAllowed = allowed.replace(/[@<>!]/g, '').toLowerCase()
      const matches = cleanRecipient.includes(cleanAllowed) || cleanAllowed.includes(cleanRecipient)
      logger.debug(`🔍 Comparing "${cleanRecipient}" with "${cleanAllowed}": ${matches}`)
      return matches
    })

    if (!isAllowedRecipient) {
      logger.info(`🔍 Recipient ${recipientToCheck} (${recipient}) not in allowed list: ${JSON.stringify(db.config.allowedRecipients)}`)
      return
    }

    // Check if currency is accepted
    const acceptedCurrencies = db.config?.acceptedCryptocurrencies || CONFIG.DEFAULT_ACCEPTED_CRYPTOCURRENCIES
    if (!acceptedCurrencies.includes(currency.toUpperCase())) {
      logger.info(`🔍 Currency ${currency} not accepted`)
      return
    }

    // Get USD value from tip.cc message first, then fallback to API
    let usdValue = await extractPriceFromTipMessage(message.content, Number.parseFloat(amount))
    if (!usdValue) {
      usdValue = await getCryptoPrice(currency, Number.parseFloat(amount))
    }
    
    if (!usdValue) {
      logger.error(`🔍 Could not get USD value for ${amount} ${currency}`)
      return
    }

    logger.info(`🔍 USD value calculated: $${usdValue.toFixed(2)}`)

    // Find sender in guild - try multiple methods
    const guild = message.guild
    let senderMember = guild.members.cache.find((member) =>
      member.user.username.toLowerCase().includes(sender.toLowerCase())
    )

    if (!senderMember) {
      // Try display name
      senderMember = guild.members.cache.find((member) =>
        member.displayName.toLowerCase().includes(sender.toLowerCase())
      )
    }

    if (!senderMember) {
      logger.error(`🔍 Could not find sender ${sender} in guild`)
      return
    }

    const senderId = senderMember.user.id
    logger.info(`🔍 Matched sender ${sender} to user ID ${senderId}`)

    // Initialize user data
    if (!db.users[senderId]) {
      db.users[senderId] = {
        totalDonated: 0,
        entries: {},
        donations: [],
        achievements: [],
        privacyEnabled: false,
        wins: 0,
        referrals: { referred: [], referredBy: null },
        luckyNumbers: [],
        milestones: [],
        streaks: { current: 0, longest: 0, lastDonation: null }
      }
    }

    logger.info(`💰 Processing donation: $${usdValue.toFixed(2)} USD`)

    // Add donation
    const oldTotal = db.users[senderId].totalDonated
    db.users[senderId].totalDonated += usdValue
    
    // Ensure donations array exists
    if (!db.users[senderId].donations) {
      db.users[senderId].donations = []
    }
    
    db.users[senderId].donations.push({
      amount: usdValue,
      currency,
      originalAmount: Number.parseFloat(amount),
      timestamp: Date.now(),
      recipient,
    })

    // Update donation streak
    updateDonationStreak(db.users[senderId])

    // Check and assign donor roles
    await assignDonorRoles(senderMember, db.users[senderId].totalDonated, oldTotal)

    // Process entries for eligible draws
    logger.info("🎯 Adding entries to eligible draws")
    let entriesAdded = 0
    
    // Check if user has selected a specific draw
    const selectedDrawId = db.users[senderId].selectedDraw
    
    for (const [drawId, draw] of Object.entries(db.donationDraws || {})) {
      if (!draw.active) continue
      if (usdValue < draw.minAmount || (draw.maxAmount && usdValue > draw.maxAmount)) continue
      if (draw.manualEntriesOnly) continue

      // If user has selected a specific draw, only process that one
      if (selectedDrawId && selectedDrawId !== 'auto' && drawId !== selectedDrawId) continue

      // Check VIP requirement
      if (draw.vipOnly && db.config?.vipRoleId) {
        const hasVipRole = senderMember.roles.cache.has(db.config.vipRoleId)
        if (!hasVipRole) continue
      }

      // Calculate entries
      const entries = Math.floor(usdValue / draw.minAmount)
      if (entries <= 0) continue

      // Check if draw has space
      const currentEntries = Object.values(draw.entries || {}).reduce((sum, count) => sum + count, 0)
      if (draw.maxEntries && currentEntries >= draw.maxEntries) continue

      // Add entries
      if (!draw.entries) draw.entries = {}
      if (!draw.entries[senderId]) draw.entries[senderId] = 0
      if (!db.users[senderId].entries) db.users[senderId].entries = {}
      if (!db.users[senderId].entries[drawId]) db.users[senderId].entries[drawId] = 0

      const entriesToAdd = draw.maxEntries ? Math.min(entries, draw.maxEntries - currentEntries) : entries
      draw.entries[senderId] += entriesToAdd
      db.users[senderId].entries[drawId] += entriesToAdd
      entriesAdded += entriesToAdd
      
      logger.info(`🎯 Added ${entriesToAdd} entries to draw: ${draw.name}`)
    }

    // Save database
    saveDatabase(serverId, db)
    logger.info("✅ Donation processed successfully")

    // Send confirmation
    if (entriesAdded > 0) {
      const confirmationMessage = `🎉 **${senderMember.user.username}** donated **$${usdValue.toFixed(
        2,
      )}** and received **${entriesAdded}** draw entries!\n\nUse \`/user entries\` to see your entries.`

      await message.channel.send(confirmationMessage)
    }

    logger.info(`Processed donation: ${sender} -> $${usdValue.toFixed(2)} (${entriesAdded} entries)`)
  } catch (error) {
    logger.error("❌ Error processing tip.cc donation:", error)
    logger.error(error)
  }
}

// Extract price from tip.cc message
async function extractPriceFromTipMessage(content, amount) {
  try {
    // Look for price patterns in tip.cc messages
    const priceRegex = /\$(\d+\.?\d*)/
    const match = content.match(priceRegex)
    
    if (match) {
      const totalPrice = parseFloat(match[1])
      logger.info(`🔍 Extracted price from tip.cc message: $${totalPrice}`)
      return totalPrice
    }
    
    return null
  } catch (error) {
    logger.error("Error extracting price from tip message:", error)
    return null
  }
}

// Get crypto price from CoinGecko API
async function getCryptoPrice(symbol, amount) {
  try {
    // Try CoinGecko first (free API)
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${getCoinGeckoId(symbol)}&vs_currencies=usd`
    )
    
    if (response.ok) {
      const data = await response.json()
      const coinId = getCoinGeckoId(symbol)
      const price = data[coinId]?.usd
      
      if (price) {
        const totalValue = price * amount
        logger.info(`🔍 CoinGecko price for ${symbol}: $${price}`)
        return totalValue
      }
    }

    // Fallback to CoinMarketCap if available
    const apiKey = process.env.COINMARKETCAP_API_KEY
    if (!apiKey) return null

    const cmcResponse = await fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol.toUpperCase()}`,
      {
        headers: {
          "X-CMC_PRO_API_KEY": apiKey,
        },
      },
    )

    const cmcData = await cmcResponse.json()
    const price = cmcData.data?.[symbol.toUpperCase()]?.quote?.USD?.price

    return price ? price * amount : null
  } catch (error) {
    logger.error(`Error fetching price for ${symbol}:`, error)
    return null
  }
}

// Map crypto symbols to CoinGecko IDs
function getCoinGeckoId(symbol) {
  const mapping = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'LTC': 'litecoin',
    'SOL': 'solana',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'XRP': 'ripple',
    'DOGE': 'dogecoin',
    'SHIB': 'shiba-inu',
    'BNB': 'binancecoin',
    'ADA': 'cardano',
    'AVAX': 'avalanche-2',
    'TON': 'the-open-network',
    'TRX': 'tron',
    'TRON': 'tron'
  }
  
  return mapping[symbol.toUpperCase()] || symbol.toLowerCase()
}

// Update donation streak
function updateDonationStreak(userData) {
  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  
  if (!userData.streaks) {
    userData.streaks = { current: 0, longest: 0, lastDonation: null }
  }
  
  if (userData.streaks.lastDonation) {
    const timeSinceLastDonation = now - userData.streaks.lastDonation
    
    if (timeSinceLastDonation <= oneDayMs) {
      // Within 24 hours, continue streak
      userData.streaks.current += 1
    } else if (timeSinceLastDonation <= 2 * oneDayMs) {
      // Within 48 hours, maintain streak
      // Don't increment, but don't reset
    } else {
      // More than 48 hours, reset streak
      userData.streaks.current = 1
    }
  } else {
    // First donation
    userData.streaks.current = 1
  }
  
  // Update longest streak
  if (userData.streaks.current > userData.streaks.longest) {
    userData.streaks.longest = userData.streaks.current
  }
  
  userData.streaks.lastDonation = now
}

// Assign donor roles based on total donations
async function assignDonorRoles(member, newTotal, oldTotal) {
  try {
    const donorRoles = CONFIG.DONOR_ROLES
    
    // Find the appropriate role for the new total
    let newRole = null
    let oldRole = null
    
    for (const [key, role] of Object.entries(donorRoles)) {
      if (newTotal >= role.minAmount && (!role.maxAmount || newTotal <= role.maxAmount)) {
        newRole = role
      }
      if (oldTotal >= role.minAmount && (!role.maxAmount || oldTotal <= role.maxAmount)) {
        oldRole = role
      }
    }
    
    // If role changed, update it
    if (newRole && newRole !== oldRole) {
      // Remove old donor roles
      for (const role of Object.values(donorRoles)) {
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role.id)
          logger.info(`🎭 Removed role: ${role.name} from ${member.user.username}`)
        }
      }
      
      // Add new role
      await member.roles.add(newRole.id)
      logger.info(`🎭 Assigned role: ${newRole.name} to ${member.user.username} (Total: $${newTotal.toFixed(2)})`)
      
      // Send congratulations message
      const channel = member.guild.channels.cache.find(ch => ch.name.includes('general') || ch.name.includes('chat'))
      if (channel) {
        const congratsMessage = `🎉 Congratulations **${member.user.username}**! You've earned the **${newRole.name}** role for donating $${newTotal.toFixed(2)}! 🎉`
        await channel.send(congratsMessage)
      }
    }
  } catch (error) {
    logger.error("Error assigning donor roles:", error)
  }
}
