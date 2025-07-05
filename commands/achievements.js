import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"
import { ACHIEVEMENTS, DEFAULT_THEME } from "../config.js"

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View and manage achievements")
  .addSubcommand(subcommand =>
    subcommand
      .setName("list")
      .setDescription("View all available achievements")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("view")
      .setDescription("View your achievements")
      .addUserOption(option =>
        option.setName("target").setDescription("User to view achievements for").setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("progress")
      .setDescription("View your achievement progress")
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case "list":
        await handleListAchievements(interaction, db)
        break
      case "view":
        await handleViewAchievements(interaction, db)
        break
      case "progress":
        await handleProgress(interaction, db)
        break
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error("Error in achievements command:", error)
    
    const errorMessage = {
      content: "❌ An error occurred while executing the achievements command.",
      flags: MessageFlags.Ephemeral,
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    } catch (followUpError) {
      logger.error("Error sending achievements error message:", followUpError)
    }
  }
}

async function handleListAchievements(interaction, db) {
  logger.debug("DEFAULT_THEME:", DEFAULT_THEME)
  logger.debug("ACHIEVEMENTS:", ACHIEVEMENTS)

  const embed = new EmbedBuilder()
    .setTitle("🏆 Available Achievements")
    .setDescription("Complete these challenges to earn achievements!")
    .setColor(DEFAULT_THEME?.info || "#00BCD4")

  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    embed.addFields({
      name: `${achievement.icon} ${achievement.name}`,
      value: achievement.description,
      inline: true,
    })
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleViewAchievements(interaction, db) {
  const targetUser = interaction.options.getUser("target") || interaction.user
  const userId = targetUser.id
  const userData = db.users?.[userId]

  if (!userData) {
    return interaction.reply({
      content: "❌ This user has no donation history yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const userAchievements = userData.achievements || []
  const totalAchievements = Object.keys(ACHIEVEMENTS).length

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${targetUser.username}'s Achievements`)
    .setDescription(`${userAchievements.length} of ${totalAchievements} achievements earned`)
    .setColor(DEFAULT_THEME?.accent || "#FF9800")
    .setThumbnail(targetUser.displayAvatarURL())

  if (userAchievements.length === 0) {
    embed.addFields({
      name: "No Achievements Yet",
      value: "Make donations to earn achievements!",
      inline: false,
    })
  } else {
    for (const achievementId of userAchievements) {
      const achievement = ACHIEVEMENTS[achievementId]
      if (achievement) {
        embed.addFields({
          name: `${achievement.icon} ${achievement.name}`,
          value: achievement.description,
          inline: true,
        })
      }
    }
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleProgress(interaction, db) {
  const userId = interaction.user.id
  const userData = db.users?.[userId]

  if (!userData) {
    return interaction.reply({
      content: "❌ You have no donation history yet. Make a donation to get started!",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("📊 Achievement Progress")
    .setDescription("Your progress towards earning achievements")
    .setColor(DEFAULT_THEME?.accent || "#FF9800")

  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    const hasAchievement = userData.achievements?.includes(id)
    const status = hasAchievement ? "✅" : "❌"
    
    let progress = ""
    if (!hasAchievement) {
      // Add specific progress info based on achievement type
      if (id === "generous_donor") {
        progress = ` ($${userData.totalDonated.toFixed(2)}/$100)`
      } else if (id === "big_spender") {
        progress = ` ($${userData.totalDonated.toFixed(2)}/$500)`
      } else if (id === "whale") {
        progress = ` ($${userData.totalDonated.toFixed(2)}/$1000)`
      } else if (id === "streak_master") {
        progress = ` (${userData.streaks?.longest || 0}/7 days)`
      } else if (id === "community_pillar") {
        const referrals = userData.referrals?.referred?.length || 0
        progress = ` (${referrals}/3 referrals)`
      }
    }

    embed.addFields({
      name: `${status} ${achievement.icon} ${achievement.name}`,
      value: `${achievement.description}${progress}`,
      inline: true,
    })
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}