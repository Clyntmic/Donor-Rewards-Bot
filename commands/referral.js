import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase, saveDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"

export const data = new SlashCommandBuilder()
  .setName("referral")
  .setDescription("Manage referral system")
  .addSubcommand(subcommand =>
    subcommand
      .setName("code")
      .setDescription("Get your referral code")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("use")
      .setDescription("Use a referral code")
      .addStringOption(option =>
        option
          .setName("code")
          .setDescription("Referral code to use")
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("stats")
      .setDescription("View your referral statistics")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("leaderboard")
      .setDescription("View referral leaderboard")
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case "code":
        await handleGetCode(interaction, db)
        break
      case "use":
        await handleUseCode(interaction, db)
        break
      case "stats":
        await handleStats(interaction, db)
        break
      case "leaderboard":
        await handleLeaderboard(interaction, db)
        break
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error("Error in referral command:", error)
    
    const errorMessage = {
      content: "❌ An error occurred while processing the referral command.",
      flags: MessageFlags.Ephemeral,
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    } catch (followUpError) {
      logger.error("Error sending referral error message:", followUpError)
    }
  }
}

async function handleGetCode(interaction, db) {
  const userId = interaction.user.id
  
  // Initialize user data if needed
  if (!db.users[userId]) {
    db.users[userId] = {
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

  // Generate referral code if not exists
  if (!db.users[userId].referralCode) {
    db.users[userId].referralCode = generateReferralCode(userId)
    saveDatabase(interaction.guildId, db)
  }

  const referralCode = db.users[userId].referralCode
  const referredCount = db.users[userId].referrals?.referred?.length || 0

  const embed = new EmbedBuilder()
    .setTitle("🔗 Your Referral Code")
    .setDescription("Share this code with friends to earn rewards!")
    .setColor(db.config?.theme?.primary || "#4CAF50")
    .addFields(
      { name: "📋 Your Code", value: `\`${referralCode}\``, inline: true },
      { name: "👥 Referrals", value: referredCount.toString(), inline: true },
      { name: "🎁 Rewards Earned", value: `${referredCount * 5} bonus entries`, inline: true }
    )
    .addFields({
      name: "💡 How It Works",
      value: [
        "• Share your code with friends",
        "• They use `/referral use code:YOUR_CODE`",
        "• Both of you get bonus entries in draws!",
        "• You earn 5 bonus entries per referral"
      ].join("\n"),
      inline: false,
    })
    .setFooter({ text: "Powered By Aegisum Eco System" })

  await interaction.reply({ embeds: [embed] })
}

async function handleUseCode(interaction, db) {
  const userId = interaction.user.id
  const code = interaction.options.getString("code").toUpperCase()

  // Initialize user data if needed
  if (!db.users[userId]) {
    db.users[userId] = {
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

  // Check if user already used a referral code
  if (db.users[userId].referrals?.referredBy) {
    return interaction.reply({
      content: "❌ You have already used a referral code.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Find the referrer
  let referrerId = null
  for (const [id, userData] of Object.entries(db.users || {})) {
    if (userData.referralCode === code) {
      referrerId = id
      break
    }
  }

  if (!referrerId) {
    return interaction.reply({
      content: "❌ Invalid referral code.",
      flags: MessageFlags.Ephemeral,
    })
  }

  if (referrerId === userId) {
    return interaction.reply({
      content: "❌ You cannot use your own referral code.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Apply referral
  db.users[userId].referrals.referredBy = referrerId
  
  if (!db.users[referrerId].referrals) {
    db.users[referrerId].referrals = { referred: [], referredBy: null }
  }
  if (!db.users[referrerId].referrals.referred) {
    db.users[referrerId].referrals.referred = []
  }
  
  db.users[referrerId].referrals.referred.push(userId)

  saveDatabase(interaction.guildId, db)

  // Get referrer info
  const referrer = await interaction.guild.members.fetch(referrerId).catch(() => null)
  const referrerName = referrer?.user.username || "Unknown User"

  const embed = new EmbedBuilder()
    .setTitle("✅ Referral Code Applied")
    .setDescription(`You've been referred by **${referrerName}**!`)
    .setColor(db.config?.theme?.success || "#4CAF50")
    .addFields({
      name: "🎁 Rewards",
      value: [
        "• You'll get bonus entries on your first donation",
        "• Your referrer gets 5 bonus entries",
        "• Both of you support the community!"
      ].join("\n"),
      inline: false,
    })
    .setFooter({ text: "Powered By Aegisum Eco System" })

  await interaction.reply({ embeds: [embed] })

  // Notify referrer if possible
  try {
    const referrerUser = referrer?.user
    if (referrerUser) {
      const dmEmbed = new EmbedBuilder()
        .setTitle("🎉 New Referral!")
        .setDescription(`**${interaction.user.username}** used your referral code!`)
        .setColor(db.config?.theme?.success || "#4CAF50")
        .addFields({
          name: "🎁 Reward",
          value: "You've earned 5 bonus entries in active draws!",
          inline: false,
        })

      await referrerUser.send({ embeds: [dmEmbed] }).catch(() => {
        // Ignore DM errors
      })
    }
  } catch (error) {
    // Ignore notification errors
  }

  logger.info(`Referral used: ${interaction.user.tag} referred by ${referrerName}`)
}

async function handleStats(interaction, db) {
  const userId = interaction.user.id
  const userData = db.users?.[userId]

  if (!userData) {
    return interaction.reply({
      content: "❌ You haven't joined the referral system yet. Use `/referral code` to get started!",
      flags: MessageFlags.Ephemeral,
    })
  }

  const referredCount = userData.referrals?.referred?.length || 0
  const referredBy = userData.referrals?.referredBy
  const bonusEntries = referredCount * 5

  let referrerName = "None"
  if (referredBy) {
    const referrer = await interaction.guild.members.fetch(referredBy).catch(() => null)
    referrerName = referrer?.user.username || "Unknown User"
  }

  const embed = new EmbedBuilder()
    .setTitle("📊 Your Referral Statistics")
    .setDescription("Your referral activity and rewards")
    .setColor(db.config?.theme?.info || "#00BCD4")
    .addFields(
      { name: "👥 People Referred", value: referredCount.toString(), inline: true },
      { name: "🎁 Bonus Entries Earned", value: bonusEntries.toString(), inline: true },
      { name: "🔗 Referred By", value: referrerName, inline: true }
    )

  if (referredCount > 0) {
    // Get referred users
    const referredUsers = []
    for (const referredId of userData.referrals.referred) {
      const user = await interaction.guild.members.fetch(referredId).catch(() => null)
      if (user) {
        referredUsers.push(user.user.username)
      }
    }

    if (referredUsers.length > 0) {
      embed.addFields({
        name: "👥 Your Referrals",
        value: referredUsers.join(", "),
        inline: false,
      })
    }
  }

  embed.addFields({
    name: "🏆 Achievements",
    value: [
      referredCount >= 1 ? "✅" : "❌" + " First Referral",
      referredCount >= 3 ? "✅" : "❌" + " Community Builder (3 referrals)",
      referredCount >= 5 ? "✅" : "❌" + " Influencer (5 referrals)",
      referredCount >= 10 ? "✅" : "❌" + " Ambassador (10 referrals)"
    ].join("\n"),
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleLeaderboard(interaction, db) {
  const users = Object.entries(db.users || {})
    .map(([userId, userData]) => {
      const referralCount = userData.referrals?.referred?.length || 0
      return [userId, { ...userData, referralCount }]
    })
    .filter(([userId, userData]) => userData.referralCount > 0)
    .sort(([, a], [, b]) => b.referralCount - a.referralCount)
    .slice(0, 10)

  if (users.length === 0) {
    return interaction.reply({
      content: "❌ No referrals found yet. Be the first to refer someone!",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Referral Leaderboard")
    .setDescription("Top referrers in the community")
    .setColor(db.config?.theme?.special || "#E91E63")

  let leaderboardText = ""
  for (let i = 0; i < users.length; i++) {
    const [userId, userData] = users[i]
    const user = await interaction.guild.members.fetch(userId).catch(() => null)
    const username = user?.user.username || "Unknown User"
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
    
    leaderboardText += `${medal} **${username}** - ${userData.referralCount} referrals\n`
  }

  embed.addFields({
    name: "Top Referrers",
    value: leaderboardText,
    inline: false,
  })

  embed.addFields({
    name: "🎁 Referral Rewards",
    value: [
      "• 5 bonus entries per referral",
      "• Special achievements for milestones",
      "• Recognition in the community",
      "• Help grow our amazing community!"
    ].join("\n"),
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

function generateReferralCode(userId) {
  // Generate a 6-character code based on user ID
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  
  // Use user ID as seed for consistency
  let seed = parseInt(userId.slice(-8), 16) || 1
  
  for (let i = 0; i < 6; i++) {
    seed = (seed * 9301 + 49297) % 233280
    result += chars[seed % chars.length]
  }
  
  return result
}