import { Events } from "discord.js"
import { getDatabase, saveDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"
import { CONFIG, ACHIEVEMENTS } from "../config.js"
import fetch from "node-fetch"

export const name = Events.MessageCreate

export async function execute(message) {
  // Check for tip.cc donations first (before ignoring bot messages)
  if (message.author.id === "617037497574359050") {
    // tip.cc bot ID
    await handleTipccDonation(message)
    return
  }

  // Ignore other bot messages
  if (message.author.bot) return
}

async function handleTipccDonation(message) {
  try {
    logger.info(`🔍 Processing tip.cc message: "${message.content}"`)
    
    const serverId = message.guildId
    if (!serverId) return

    const db = getDatabase(serverId)

    // Parse tip.cc message - try multiple regex patterns
    let match = null
    let sender, amount, currency, recipient

    // Pattern 1: Actual tip.cc format - <:LTC:123> <@!123> sent <@123> **amount CURRENCY** (≈ $price).
    const tipRegex1 = /<:[A-Z]+:\d+>\s*<@!?(\d+)>\s*sent\s*<@!?(\d+)>\s*\*\*([\d.]+)\s*([A-Z]+)\*\*\s*\(≈\s*\$[\d.]+\)\./i
    match = message.content.match(tipRegex1)
    
    if (match) {
      sender = match[1] // sender user ID
      recipient = match[2] // recipient user ID
      amount = match[3]
      currency = match[4]
      logger.debug(`🔍 Matched Pattern 1 (Custom Emoji): ${sender} -> ${recipient}, ${amount} ${currency}`)
    }

    if (!match) {
      // Pattern 2: Alternative format - 💰 @username sent @recipient amount CURRENCY (≈ $price).
      const tipRegex2 = /💰\s*@(\w+)\s*sent\s*@(\w+)\s*([\d.]+)\s*(\w+)\s*\(≈\s*\$[\d.]+\)\./i
      match = message.content.match(tipRegex2)
      if (match) {
        sender = match[1] // sender username
        recipient = match[2] // recipient username
        amount = match[3]
        currency = match[4]
        logger.debug(`🔍 Matched Pattern 2 (Username): ${sender} -> ${recipient}, ${amount} ${currency}`)
      }
    }

    if (!match) {
      // Pattern 3: Simple format - <@!123> sent <@123> amount CURRENCY (≈ $price).
      const tipRegex3 = /<@!?(\d+)>\s*sent\s*<@!?(\d+)>\s*([\d.]+)\s*(\w+)\s*\(≈\s*\$[\d.]+\)\./i
      match = message.content.match(tipRegex3)
      if (match) {
        sender = match[1] // sender user ID
        recipient = match[2] // recipient user ID  
        amount = match[3]
        currency = match[4]
        logger.debug(`🔍 Matched Pattern 3 (User IDs): ${sender} -> ${recipient}, ${amount} ${currency}`)
      }
    }

    if (!match) {
      // Pattern 4: Simple format - username sent amount currency to recipient
      const tipRegex4 = /(\w+)\s*sent\s*([\d.]+)\s*(\w+)\s*to\s*(\w+)/i
      match = message.content.match(tipRegex4)
      if (match) {
        [, sender, amount, currency, recipient] = match
        logger.debug(`🔍 Matched Pattern 4: ${sender} -> ${recipient}, ${amount} ${currency}`)
      }
    }

    if (!match) {
      logger.info(`🔍 No tip match found in message: "${message.content}"`)
      logger.debug(`🔍 Tried all 4 regex patterns but none matched`)
      return
    }

    logger.info(`🔍 Detected tip: ${sender} sent ${amount} ${currency} to ${recipient}`)

    // Check if recipient is in allowed recipients
    if (!db.config?.allowedRecipients?.length) {
      logger.info("🔍 No allowed recipients configured")
      return
    }

    // Check if recipient is in allowed recipients - simplified approach
    let isAllowedRecipient = false
    
    logger.debug(`🔍 Checking recipient: ${recipient} against allowed list: ${JSON.stringify(db.config.allowedRecipients)}`)
    
    // Check direct match with recipient ID
    isAllowedRecipient = db.config.allowedRecipients.some((allowed) => {
      if (typeof allowed !== 'string') return false
      
      // Clean both values
      const cleanAllowed = allowed.replace(/[@<>!]/g, '')
      const cleanRecipient = recipient.replace(/[@<>!]/g, '')
      
      // Check if they match
      const matches = cleanAllowed === cleanRecipient
      logger.debug(`🔍 Comparing "${cleanRecipient}" with "${cleanAllowed}": ${matches}`)
      return matches
    })

    if (!isAllowedRecipient) {
      logger.info(`🔍 Recipient ${recipient} not in allowed list: ${JSON.stringify(db.config.allowedRecipients)}`)
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

    // Find sender in guild - handle both user IDs and usernames
    const guild = message.guild
    let senderMember = null

    // If sender is a user ID (all digits), fetch directly
    if (/^\d+$/.test(sender)) {
      try {
        senderMember = await guild.members.fetch(sender)
        logger.debug(`🔍 Found sender by ID: ${sender}`)
      } catch (error) {
        logger.debug(`🔍 Could not fetch member by ID ${sender}`)
      }
    }

    // If not found by ID, try username matching
    if (!senderMember) {
      senderMember = guild.members.cache.find((member) =>
        member.user.username.toLowerCase().includes(sender.toLowerCase())
      )
    }

    // Try display name as fallback
    if (!senderMember) {
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
    
    // Check and assign achievements
    await checkAndAssignAchievements(senderMember, db.users[senderId], db)

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

    // Send enhanced confirmation message
    if (entriesAdded > 0) {
      // Create a beautiful confirmation message with user mention
      const confirmationMessage = `🎉 **Thank you for your donation!** 🎉

<@${senderMember.user.id}> just donated **$${usdValue.toFixed(2)}** and received **${entriesAdded}** draw entries!

🎫 **Total Entries:** ${entriesAdded}
💰 **Donation Amount:** $${usdValue.toFixed(2)}
🏆 **Total Donated:** $${db.users[senderId].totalDonated.toFixed(2)}

Use \`/user entries\` to see all your entries across draws!

*Thank you for supporting our community!* ❤️`

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

// Get crypto price from multiple APIs with fallback
async function getCryptoPrice(symbol, amount) {
  const apis = [
    { name: 'CoinGecko', func: fetchCoinGeckoPrice },
    { name: 'CoinPaprika', func: fetchCoinPaprikaPrice },
    { name: 'CoinMarketCap', func: fetchCoinMarketCapPrice }
  ]

  for (const api of apis) {
    try {
      const price = await api.func(symbol)
      if (price && price > 0) {
        const totalValue = price * amount
        logger.info(`🔍 ${api.name} price for ${symbol}: $${price} (Total: $${totalValue.toFixed(4)})`)
        return totalValue
      }
    } catch (error) {
      logger.debug(`${api.name} failed for ${symbol}:`, error.message)
    }
  }

  logger.warn(`❌ Could not fetch price for ${symbol} from any API`)
  return null
}

// CoinGecko API (Free)
async function fetchCoinGeckoPrice(symbol) {
  const coinId = getCoinGeckoId(symbol)
  if (!coinId) return null

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
    { timeout: 5000 }
  )
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  
  const data = await response.json()
  return data[coinId]?.usd || null
}

// CoinPaprika API (Free)
async function fetchCoinPaprikaPrice(symbol) {
  const coinId = getCoinPaprikaId(symbol)
  if (!coinId) return null

  const response = await fetch(
    `https://api.coinpaprika.com/v1/tickers/${coinId}`,
    { timeout: 5000 }
  )
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  
  const data = await response.json()
  return data.quotes?.USD?.price || null
}

// CoinMarketCap API (Requires API key)
async function fetchCoinMarketCapPrice(symbol) {
  const apiKey = process.env.COINMARKETCAP_API_KEY
  if (!apiKey) throw new Error('No API key')

  const response = await fetch(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol.toUpperCase()}`,
    {
      headers: { "X-CMC_PRO_API_KEY": apiKey },
      timeout: 5000
    }
  )

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  
  const data = await response.json()
  return data.data?.[symbol.toUpperCase()]?.quote?.USD?.price || null
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

// Map crypto symbols to CoinPaprika IDs
function getCoinPaprikaId(symbol) {
  const mapping = {
    'BTC': 'btc-bitcoin',
    'ETH': 'eth-ethereum',
    'LTC': 'ltc-litecoin',
    'SOL': 'sol-solana',
    'USDT': 'usdt-tether',
    'USDC': 'usdc-usd-coin',
    'XRP': 'xrp-xrp',
    'DOGE': 'doge-dogecoin',
    'SHIB': 'shib-shiba-inu',
    'BNB': 'bnb-binance-coin',
    'ADA': 'ada-cardano',
    'AVAX': 'avax-avalanche',
    'TON': 'ton-the-open-network',
    'TRX': 'trx-tron',
    'TRON': 'trx-tron'
  }
  
  return mapping[symbol.toUpperCase()] || null
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
    const serverId = member.guild.id
    const db = getDatabase(serverId)
    const donorRoles = db.config?.donorRoles || {}
    
    // Skip if no donor roles configured
    if (Object.keys(donorRoles).length === 0) {
      logger.debug("🎭 No donor roles configured, skipping role assignment")
      return
    }
    
    // Find current role the user has (check actual Discord roles)
    let currentRole = null
    let currentRoleValue = 0
    
    for (const [key, role] of Object.entries(donorRoles)) {
      if (member.roles.cache.has(role.id)) {
        if (role.minAmount > currentRoleValue) {
          currentRole = role
          currentRoleValue = role.minAmount
        }
      }
    }
    
    // Find the appropriate role for the new total
    let newRole = null
    let newRoleValue = 0
    
    for (const [key, role] of Object.entries(donorRoles)) {
      if (newTotal >= role.minAmount && (!role.maxAmount || newTotal <= role.maxAmount)) {
        if (role.minAmount > newRoleValue) {
          newRole = role
          newRoleValue = role.minAmount
        }
      }
    }
    
    // Only update if the new role is higher than current role
    if (newRole && (!currentRole || newRoleValue > currentRoleValue)) {
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
        const congratsMessage = `🎊 **ROLE UPGRADE!** 🎊

Congratulations <@${member.user.id}>! 

🎭 **New Role:** ${newRole.name}
💰 **Total Donated:** $${newTotal.toFixed(2)}
⭐ **Achievement Unlocked!**

Thank you for your continued support! 🙏✨`
        await channel.send(congratsMessage)
      }
    } else if (currentRole && newRole && currentRoleValue > newRoleValue) {
      logger.info(`🎭 User ${member.user.username} already has higher role ${currentRole.name}, not downgrading`)
    }
  } catch (error) {
    logger.error("Error assigning donor roles:", error)
  }
}

// Check and assign achievements
async function checkAndAssignAchievements(member, userData, db) {
  try {
    if (!userData.achievements) userData.achievements = []
    
    const achievements = ACHIEVEMENTS
    let newAchievements = []
    
    for (const [key, achievement] of Object.entries(achievements)) {
      // Skip if already earned
      if (userData.achievements.includes(key)) continue
      
      let earned = false
      
      switch (key) {
        case 'first_steps':
          earned = userData.totalDonated > 0
          break
        case 'generous_donor':
          earned = userData.totalDonated >= 100
          break
        case 'big_spender':
          earned = userData.totalDonated >= 500
          break
        case 'whale':
          earned = userData.totalDonated >= 1000
          break
        case 'streak_master':
          earned = userData.streaks?.current >= 7
          break
        case 'community_pillar':
          // Check referrals
          const referralCount = Object.values(db.users).filter(user => user.referredBy === member.user.id).length
          earned = referralCount >= 3
          break
        case 'lucky_winner':
          // Check if user has won any draws
          earned = userData.wins > 0
          break
      }
      
      if (earned) {
        userData.achievements.push(key)
        newAchievements.push(achievement)
        logger.info(`🏆 Achievement earned: ${achievement.name} by ${member.user.username}`)
      }
    }
    
    // Send achievement notifications
    if (newAchievements.length > 0) {
      const channel = member.guild.channels.cache.find(ch => ch.name.includes('general') || ch.name.includes('chat'))
      if (channel) {
        for (const achievement of newAchievements) {
          const achievementMessage = `🏆 **ACHIEVEMENT UNLOCKED!** 🏆

<@${member.user.id}> just earned:

🎖️ **${achievement.name}**
📝 *${achievement.description}*

Congratulations! 🎉✨`
          await channel.send(achievementMessage)
        }
      }
    }
  } catch (error) {
    logger.error("Error checking achievements:", error)
  }
}
