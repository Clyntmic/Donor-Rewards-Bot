import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"
import { CONFIG, ACHIEVEMENTS } from "../config.js"

export const data = new SlashCommandBuilder()
  .setName("user")
  .setDescription("User-related commands")
  .addSubcommand(subcommand =>
    subcommand
      .setName("profile")
      .setDescription("View user donation profile")
      .addUserOption(option =>
        option.setName("target").setDescription("User to view profile for").setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("entries")
      .setDescription("View your draw entries")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("achievements")
      .setDescription("View user achievements")
      .addUserOption(option =>
        option.setName("target").setDescription("User to view achievements for").setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("donor_roles")
      .setDescription("View donor role requirements and progress")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("select_draw")
      .setDescription("Select a specific draw for future donations")
      .addStringOption(option =>
        option.setName("draw_id").setDescription("Draw ID to select (use 'auto' for automatic)").setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("privacy")
      .setDescription("Manage your privacy settings")
      .addStringOption(option =>
        option
          .setName("setting")
          .setDescription("Privacy setting to change")
          .setRequired(true)
          .addChoices(
            { name: "Hide Profile", value: "hide_profile" },
            { name: "Hide Donations", value: "hide_donations" },
            { name: "Hide Achievements", value: "hide_achievements" },
            { name: "View Settings", value: "view" }
          )
      )
      .addBooleanOption(option =>
        option.setName("enabled").setDescription("Enable or disable this privacy setting").setRequired(false)
      )
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case "profile":
        await handleProfile(interaction, db)
        break
      case "entries":
        await handleEntries(interaction, db)
        break
      case "achievements":
        await handleAchievements(interaction, db)
        break
      case "donor_roles":
        await handleDonorRoles(interaction, db)
        break
      case "select_draw":
        await handleSelectDraw(interaction, db)
        break
      case "privacy":
        await handlePrivacy(interaction, db)
        break
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error("Error in user command:", error)
    
    const errorMessage = {
      content: "❌ An error occurred while executing the user command.",
      flags: MessageFlags.Ephemeral,
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    } catch (followUpError) {
      logger.error("Error sending user error message:", followUpError)
    }
  }
}

async function handleProfile(interaction, db) {
  const targetUser = interaction.options.getUser("target") || interaction.user
  const userId = targetUser.id
  const userData = db.users?.[userId]

  if (!userData) {
    return interaction.reply({
      content: "❌ This user has no donation history yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${targetUser.username}'s Profile`)
    .setDescription("Donation profile and statistics")
    .setColor(db.config?.theme?.primary || "#4CAF50")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "💰 Total Donated", value: `$${userData.totalDonated.toFixed(2)}`, inline: true },
      { name: "🎁 Total Entries", value: Object.values(userData.entries || {}).reduce((sum, count) => sum + count, 0).toString(), inline: true },
      { name: "🏆 Wins", value: (userData.wins || 0).toString(), inline: true },
      { name: "🔥 Current Streak", value: `${userData.streaks?.current || 0} days`, inline: true },
      { name: "📈 Longest Streak", value: `${userData.streaks?.longest || 0} days`, inline: true },
      { name: "🎯 Achievements", value: `${userData.achievements?.length || 0}/${Object.keys(ACHIEVEMENTS).length}`, inline: true }
    )
    .setFooter({ text: "Powered By Aegisum Eco System" })

  await interaction.reply({ embeds: [embed] })
}

async function handleEntries(interaction, db) {
  const userId = interaction.user.id
  const userData = db.users?.[userId]

  if (!userData?.entries || Object.keys(userData.entries).length === 0) {
    return interaction.reply({
      content: "❌ You don't have any draw entries yet. Make a donation to get started!",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Your Draw Entries")
    .setDescription("Current entries in active draws")
    .setColor(db.config?.theme?.primary || "#4CAF50")

  for (const [drawId, entries] of Object.entries(userData.entries)) {
    const draw = db.donationDraws?.[drawId]
    if (draw && draw.active && entries > 0) {
      embed.addFields({
        name: `🎁 ${draw.name}`,
        value: `**${entries}** entries\nReward: ${draw.reward}`,
        inline: true,
      })
    }
  }

  if (embed.data.fields?.length === 0) {
    embed.setDescription("❌ No entries in active draws.")
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleAchievements(interaction, db) {
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
    .setColor(db.config?.theme?.accent || "#FF9800")
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

async function handleDonorRoles(interaction, db) {
  const userId = interaction.user.id
  const userData = db.users?.[userId]
  const totalDonated = userData?.totalDonated || 0

  const embed = new EmbedBuilder()
    .setTitle("🎭 Donor Roles")
    .setDescription(`You have donated a total of $${totalDonated.toFixed(2)}`)
    .setColor(db.config?.theme?.primary || "#4CAF50")

  // Find current role
  let currentRole = null
  let nextRole = null

  const sortedRoles = Object.entries(CONFIG.DONOR_ROLES).sort((a, b) => a[1].minAmount - b[1].minAmount)

  for (const [key, role] of sortedRoles) {
    if (totalDonated >= role.minAmount && (!role.maxAmount || totalDonated <= role.maxAmount)) {
      currentRole = role
    } else if (totalDonated < role.minAmount && !nextRole) {
      nextRole = role
    }
  }

  if (currentRole) {
    embed.addFields({
      name: "🏅 Current Role",
      value: `**${currentRole.name}**\nRequired: $${currentRole.minAmount}+`,
      inline: true,
    })
  }

  if (nextRole) {
    const needed = nextRole.minAmount - totalDonated
    embed.addFields({
      name: "🎯 Next Role",
      value: `**${nextRole.name}**\nNeed: $${needed.toFixed(2)} more`,
      inline: true,
    })
  }

  // Show all roles
  const rolesText = sortedRoles.map(([key, role]) => {
    const status = totalDonated >= role.minAmount ? "✅" : "❌"
    const range = role.maxAmount ? `$${role.minAmount} - $${role.maxAmount}` : `$${role.minAmount}+`
    return `${status} **${role.name}** - ${range}`
  }).join("\n")

  embed.addFields({
    name: "📋 All Donor Roles",
    value: rolesText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleSelectDraw(interaction, db) {
  const drawId = interaction.options.getString("draw_id")
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

  if (!drawId) {
    // Show current selection
    const currentSelection = db.users[userId].selectedDraw || 'auto'
    const embed = new EmbedBuilder()
      .setTitle("🎯 Draw Selection")
      .setDescription(`Current selection: **${currentSelection === 'auto' ? 'Automatic' : currentSelection}**`)
      .setColor(db.config?.theme?.info || "#00BCD4")
      .setFooter({ text: "Use /user select_draw draw_id:DRAW_ID to change" })

    return interaction.reply({ embeds: [embed] })
  }

  if (drawId === 'auto') {
    db.users[userId].selectedDraw = 'auto'
    const embed = new EmbedBuilder()
      .setTitle("✅ Draw Selection Updated")
      .setDescription("Your donations will now automatically enter all eligible draws.")
      .setColor(db.config?.theme?.success || "#4CAF50")
      .setFooter({ text: "Powered By Aegisum Eco System" })

    await interaction.reply({ embeds: [embed] })
  } else {
    const draw = db.donationDraws?.[drawId]
    if (!draw) {
      return interaction.reply({
        content: "❌ Draw not found. Use `/draws list` to see available draws.",
        flags: MessageFlags.Ephemeral,
      })
    }

    if (!draw.active) {
      return interaction.reply({
        content: "❌ This draw is not currently active.",
        flags: MessageFlags.Ephemeral,
      })
    }

    db.users[userId].selectedDraw = drawId
    
    const embed = new EmbedBuilder()
      .setTitle("✅ Draw Selected")
      .setDescription(`Your future donations will count towards: **${draw.name}**`)
      .setColor(db.config?.theme?.success || "#4CAF50")
      .addFields(
        { name: "🎁 Draw", value: draw.name, inline: true },
        { name: "💰 Min Amount", value: `$${draw.minAmount}`, inline: true },
        { name: "🏆 Reward", value: draw.reward, inline: true }
      )
      .addFields({
        name: "📝 Note",
        value: "Use `/user select_draw draw_id:auto` to return to automatic selection.",
        inline: false,
      })
      .setFooter({ text: "Powered By Aegisum Eco System" })

    await interaction.reply({ embeds: [embed] })
  }

  // Save database
  const { saveDatabase } = await import("../utils/database.js")
  saveDatabase(interaction.guildId, db)
  
  logger.info(`User command executed: ${interaction.options.getSubcommand()} by ${interaction.user.tag}`)
}

// Handle privacy settings
async function handlePrivacy(interaction, db) {
  const userId = interaction.user.id
  const setting = interaction.options.getString("setting")
  const enabled = interaction.options.getBoolean("enabled")

  // Initialize user privacy settings if they don't exist
  if (!db.users[userId]) {
    db.users[userId] = { donations: [], totalDonated: 0, entries: {}, privacy: {} }
  }
  if (!db.users[userId].privacy) {
    db.users[userId].privacy = {}
  }

  const embed = new EmbedBuilder()
    .setColor(CONFIG.DEFAULT_THEME?.colors?.primary || "#3498db")
    .setTitle("🔒 Privacy Settings")

  if (setting === "view") {
    // Show current privacy settings
    const privacy = db.users[userId].privacy
    embed
      .setDescription("Your current privacy settings:")
      .addFields(
        {
          name: "👤 Hide Profile",
          value: privacy.hide_profile ? "🔒 Enabled" : "🔓 Disabled",
          inline: true,
        },
        {
          name: "💰 Hide Donations",
          value: privacy.hide_donations ? "🔒 Enabled" : "🔓 Disabled",
          inline: true,
        },
        {
          name: "🏆 Hide Achievements",
          value: privacy.hide_achievements ? "🔒 Enabled" : "🔓 Disabled",
          inline: true,
        }
      )
      .addFields({
        name: "📝 How to Change",
        value: "Use `/user privacy setting:SETTING enabled:true/false` to change settings.",
        inline: false,
      })
  } else {
    if (enabled === null) {
      await interaction.reply({
        content: "❌ Please specify whether to enable or disable this setting.",
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Update the setting
    db.users[userId].privacy[setting] = enabled
    
    const settingNames = {
      hide_profile: "Hide Profile",
      hide_donations: "Hide Donations", 
      hide_achievements: "Hide Achievements"
    }

    embed
      .setDescription(`Privacy setting updated successfully!`)
      .addFields({
        name: "⚙️ Setting",
        value: settingNames[setting],
        inline: true,
      }, {
        name: "🔧 Status",
        value: enabled ? "🔒 Enabled" : "🔓 Disabled",
        inline: true,
      })
      .addFields({
        name: "📝 What This Means",
        value: enabled 
          ? "Other users cannot view this information about you."
          : "Other users can view this information about you.",
        inline: false,
      })
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
}
