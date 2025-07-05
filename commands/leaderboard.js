import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View donation leaderboards")
  .addStringOption(option =>
    option
      .setName("type")
      .setDescription("Type of leaderboard to view")
      .setRequired(false)
      .addChoices(
        { name: "Total Donations", value: "total" },
        { name: "Monthly Donations", value: "monthly" },
        { name: "Weekly Donations", value: "weekly" },
        { name: "Most Entries", value: "entries" },
        { name: "Achievement Count", value: "achievements" }
      )
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const type = interaction.options.getString("type") || "total"

    switch (type) {
      case "total":
        await handleTotalLeaderboard(interaction, db)
        break
      case "monthly":
        await handleMonthlyLeaderboard(interaction, db)
        break
      case "weekly":
        await handleWeeklyLeaderboard(interaction, db)
        break
      case "entries":
        await handleEntriesLeaderboard(interaction, db)
        break
      case "achievements":
        await handleAchievementsLeaderboard(interaction, db)
        break
      default:
        await handleTotalLeaderboard(interaction, db)
    }
  } catch (error) {
    logger.error("Error in leaderboard command:", error)
    
    const errorMessage = {
      content: "❌ An error occurred while fetching the leaderboard.",
      flags: MessageFlags.Ephemeral,
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    } catch (followUpError) {
      logger.error("Error sending leaderboard error message:", followUpError)
    }
  }
}

async function handleTotalLeaderboard(interaction, db) {
  const users = Object.entries(db.users || {})
    .filter(([userId, userData]) => userData.totalDonated > 0)
    .sort(([, a], [, b]) => b.totalDonated - a.totalDonated)
    .slice(0, 10)

  if (users.length === 0) {
    return interaction.reply({
      content: "❌ No donations found yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Total Donations Leaderboard")
    .setDescription("Top donors of all time")
    .setColor(db.config?.theme?.primary || "#4CAF50")

  let leaderboardText = ""
  for (let i = 0; i < users.length; i++) {
    const [userId, userData] = users[i]
    const user = await interaction.guild.members.fetch(userId).catch(() => null)
    const username = user?.user.username || "Unknown User"
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
    
    leaderboardText += `${medal} **${username}** - $${userData.totalDonated.toFixed(2)}\n`
  }

  embed.addFields({
    name: "Top Donors",
    value: leaderboardText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleMonthlyLeaderboard(interaction, db) {
  const now = Date.now()
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartMs = monthStart.getTime()

  const users = Object.entries(db.users || {})
    .map(([userId, userData]) => {
      const monthlyTotal = (userData.donations || [])
        .filter(donation => donation.timestamp >= monthStartMs)
        .reduce((sum, donation) => sum + donation.amount, 0)
      
      return [userId, { ...userData, monthlyTotal }]
    })
    .filter(([userId, userData]) => userData.monthlyTotal > 0)
    .sort(([, a], [, b]) => b.monthlyTotal - a.monthlyTotal)
    .slice(0, 10)

  if (users.length === 0) {
    return interaction.reply({
      content: "❌ No donations found this month.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("📅 Monthly Donations Leaderboard")
    .setDescription(`Top donors for ${monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`)
    .setColor(db.config?.theme?.secondary || "#2196F3")

  let leaderboardText = ""
  for (let i = 0; i < users.length; i++) {
    const [userId, userData] = users[i]
    const user = await interaction.guild.members.fetch(userId).catch(() => null)
    const username = user?.user.username || "Unknown User"
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
    
    leaderboardText += `${medal} **${username}** - $${userData.monthlyTotal.toFixed(2)}\n`
  }

  embed.addFields({
    name: "Top Monthly Donors",
    value: leaderboardText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleWeeklyLeaderboard(interaction, db) {
  const now = Date.now()
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const weekStartMs = weekStart.getTime()

  const users = Object.entries(db.users || {})
    .map(([userId, userData]) => {
      const weeklyTotal = (userData.donations || [])
        .filter(donation => donation.timestamp >= weekStartMs)
        .reduce((sum, donation) => sum + donation.amount, 0)
      
      return [userId, { ...userData, weeklyTotal }]
    })
    .filter(([userId, userData]) => userData.weeklyTotal > 0)
    .sort(([, a], [, b]) => b.weeklyTotal - a.weeklyTotal)
    .slice(0, 10)

  if (users.length === 0) {
    return interaction.reply({
      content: "❌ No donations found this week.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("📊 Weekly Donations Leaderboard")
    .setDescription("Top donors for this week")
    .setColor(db.config?.theme?.accent || "#FF9800")

  let leaderboardText = ""
  for (let i = 0; i < users.length; i++) {
    const [userId, userData] = users[i]
    const user = await interaction.guild.members.fetch(userId).catch(() => null)
    const username = user?.user.username || "Unknown User"
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
    
    leaderboardText += `${medal} **${username}** - $${userData.weeklyTotal.toFixed(2)}\n`
  }

  embed.addFields({
    name: "Top Weekly Donors",
    value: leaderboardText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleEntriesLeaderboard(interaction, db) {
  const users = Object.entries(db.users || {})
    .map(([userId, userData]) => {
      const totalEntries = Object.values(userData.entries || {}).reduce((sum, count) => sum + count, 0)
      return [userId, { ...userData, totalEntries }]
    })
    .filter(([userId, userData]) => userData.totalEntries > 0)
    .sort(([, a], [, b]) => b.totalEntries - a.totalEntries)
    .slice(0, 10)

  if (users.length === 0) {
    return interaction.reply({
      content: "❌ No entries found yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Draw Entries Leaderboard")
    .setDescription("Users with the most draw entries")
    .setColor(db.config?.theme?.vip || "#9C27B0")

  let leaderboardText = ""
  for (let i = 0; i < users.length; i++) {
    const [userId, userData] = users[i]
    const user = await interaction.guild.members.fetch(userId).catch(() => null)
    const username = user?.user.username || "Unknown User"
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
    
    leaderboardText += `${medal} **${username}** - ${userData.totalEntries} entries\n`
  }

  embed.addFields({
    name: "Most Entries",
    value: leaderboardText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleAchievementsLeaderboard(interaction, db) {
  const users = Object.entries(db.users || {})
    .map(([userId, userData]) => {
      const achievementCount = (userData.achievements || []).length
      return [userId, { ...userData, achievementCount }]
    })
    .filter(([userId, userData]) => userData.achievementCount > 0)
    .sort(([, a], [, b]) => b.achievementCount - a.achievementCount)
    .slice(0, 10)

  if (users.length === 0) {
    return interaction.reply({
      content: "❌ No achievements earned yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Achievements Leaderboard")
    .setDescription("Users with the most achievements")
    .setColor(db.config?.theme?.special || "#E91E63")

  let leaderboardText = ""
  for (let i = 0; i < users.length; i++) {
    const [userId, userData] = users[i]
    const user = await interaction.guild.members.fetch(userId).catch(() => null)
    const username = user?.user.username || "Unknown User"
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
    
    leaderboardText += `${medal} **${username}** - ${userData.achievementCount} achievements\n`
  }

  embed.addFields({
    name: "Achievement Leaders",
    value: leaderboardText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}