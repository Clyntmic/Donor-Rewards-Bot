import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import { getDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show comprehensive help information")
  .addStringOption(option =>
    option.setName("type")
      .setDescription("Type of help to show")
      .addChoices(
        { name: "User Commands", value: "user" },
        { name: "Admin Commands", value: "admin" }
      )
      .setRequired(false)
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const helpType = interaction.options.getString("type")
    const isAdmin = await checkAdminPermissions(interaction, db)

    // If admin type requested but user is not admin
    if (helpType === "admin" && !isAdmin) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Access Denied")
        .setDescription("You don't have permission to view admin commands.")
        .setColor("#ff0000")
      
      return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
    }

    // Show specific help type if requested
    if (helpType === "admin") {
      return await showAdminHelp(interaction, db)
    } else if (helpType === "user") {
      return await showUserHelp(interaction, db, 0)
    }

    // Show main help menu with navigation
    await showMainHelp(interaction, db, isAdmin)
  } catch (error) {
    logger.error("Error in help command:", error)
    await interaction.reply({
      content: "❌ An error occurred while fetching help information.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function showMainHelp(interaction, db, isAdmin) {
  const embed = new EmbedBuilder()
    .setTitle("🆘 Donor Rewards Bot - Help Center")
    .setDescription("**Welcome to the Donor Rewards Bot!**\n\nThis bot automatically tracks your donations and rewards you with draw entries, achievements, and special roles. Choose a category below to learn more.")
    .setColor(db.config?.theme?.info || "#00BCD4")

  embed.addFields(
    {
      name: "🚀 Getting Started",
      value: [
        "1. **Donate** using tip.cc: `$tip @recipient amount SYMBOL`",
        "2. **Check draws** with `/draws list`",
        "3. **View your entries** with `/user entries`",
        "4. **Track progress** with `/user profile`",
        "5. **Earn achievements** by donating regularly!"
      ].join("\n"),
      inline: false
    },
    {
      name: "📚 Help Categories",
      value: [
        "🎯 **Essential Commands** - Core functionality",
        "👤 **User Commands** - Profile, entries, achievements",
        "🎁 **Draw System** - How draws work and entry tracking",
        "🏆 **Achievements** - Unlock rewards by donating",
        "🎭 **Donor Roles** - Special roles based on donation amounts"
      ].join("\n"),
      inline: false
    },
    {
      name: "💡 Quick Commands",
      value: [
        "`/donate` - Learn how to donate",
        "`/draws list` - See available draws",
        "`/user entries` - Check your entries",
        "`/user profile` - View your stats"
      ].join("\n"),
      inline: true
    },
    {
      name: "🔗 Features",
      value: [
        "• Real-time donation tracking",
        "• Multiple draw participation",
        "• Achievement system",
        "• Privacy controls",
        "• Leaderboards"
      ].join("\n"),
      inline: true
    }
  )

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("help_user_0")
        .setLabel("User Commands")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("👤"),
      new ButtonBuilder()
        .setCustomId("help_draws")
        .setLabel("Draw System")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🎁"),
      new ButtonBuilder()
        .setCustomId("help_achievements")
        .setLabel("Achievements")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏆")
    )

  if (isAdmin) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId("help_admin")
        .setLabel("Admin Commands")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("⚙️")
    )
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System • Page 1/1" })
  
  const response = await interaction.reply({ 
    embeds: [embed], 
    components: [buttons], 
    flags: MessageFlags.Ephemeral 
  })

  // Set up button collector
  const collector = response.createMessageComponentCollector({ time: 300000 }) // 5 minutes

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      return await buttonInteraction.reply({ 
        content: "❌ You can't use these buttons.", 
        flags: MessageFlags.Ephemeral 
      })
    }

    const [action, type, page] = buttonInteraction.customId.split('_')
    
    if (action === 'help') {
      switch (type) {
        case 'user':
          await showUserHelp(buttonInteraction, db, parseInt(page) || 0)
          break
        case 'admin':
          if (isAdmin) await showAdminHelp(buttonInteraction, db)
          break
        case 'draws':
          await showDrawHelp(buttonInteraction, db)
          break
        case 'achievements':
          await showAchievementHelp(buttonInteraction, db)
          break
        case 'back':
          await showMainHelp(buttonInteraction, db, isAdmin)
          break
      }
    }
  })

  collector.on('end', () => {
    // Disable buttons after timeout
    buttons.components.forEach(button => button.setDisabled(true))
    interaction.editReply({ components: [buttons] }).catch(() => {})
  })
}

async function showUserHelp(interaction, db, page = 0) {
  const userPages = [
    {
      title: "👤 User Commands - Profile & Stats",
      description: "Commands to view and manage your donation profile and statistics.",
      fields: [
        {
          name: "/user profile [target]",
          value: "View detailed donation profile including total donated, achievements earned, and donation history. Add `target` to view another user's public profile.",
          inline: false
        },
        {
          name: "/user entries",
          value: "Check your current draw entries across all active draws. Shows how many entries you have in each draw and potential rewards.",
          inline: false
        },
        {
          name: "/user donor_roles",
          value: "View donor role requirements and your progress towards the next role. Shows all available donor roles and their donation thresholds.",
          inline: false
        },
        {
          name: "/user select_draw [draw_id]",
          value: "Choose which draw your future donations will count towards. Use `auto` to return to automatic selection based on donation amount.",
          inline: false
        }
      ]
    },
    {
      title: "👤 User Commands - Achievements & Privacy",
      description: "Commands for achievements, privacy settings, and social features.",
      fields: [
        {
          name: "/user achievements [target]",
          value: "View your earned achievements and progress towards locked ones. Achievements are unlocked by donating, reaching milestones, and participating in draws.",
          inline: false
        },
        {
          name: "/user privacy <setting>",
          value: "Manage your privacy settings:\n• `hide_profile` - Hide your profile from others\n• `hide_donations` - Hide donation amounts\n• `hide_achievements` - Hide achievement progress",
          inline: false
        },
        {
          name: "/user leaderboard [type]",
          value: "View leaderboards:\n• `donations` - Top donors by amount\n• `entries` - Most draw entries\n• `achievements` - Most achievements earned",
          inline: false
        }
      ]
    }
  ]

  const currentPage = userPages[page] || userPages[0]
  const embed = new EmbedBuilder()
    .setTitle(currentPage.title)
    .setDescription(currentPage.description)
    .setColor(db.config?.theme?.info || "#00BCD4")

  currentPage.fields.forEach(field => embed.addFields(field))

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("help_back")
        .setLabel("← Back to Main")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏠")
    )

  if (page > 0) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`help_user_${page - 1}`)
        .setLabel("← Previous")
        .setStyle(ButtonStyle.Primary)
    )
  }

  if (page < userPages.length - 1) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`help_user_${page + 1}`)
        .setLabel("Next →")
        .setStyle(ButtonStyle.Primary)
    )
  }

  embed.setFooter({ text: `Powered By Aegisum Eco System • Page ${page + 1}/${userPages.length}` })

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [buttons] })
  } else {
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral })
  }
}

async function showAdminHelp(interaction, db) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Admin Commands - Management Tools")
    .setDescription("**Administrative commands for bot management and configuration.**\n\n⚠️ These commands require admin permissions.")
    .setColor("#ff6b6b")

  embed.addFields(
    {
      name: "🔧 Setup & Configuration",
      value: [
        "`/admin setup` - Initial bot configuration wizard",
        "`/admin configure_donor_roles` - Set up donor role system",
        "`/admin features` - Toggle bot features on/off",
        "`/admin add_recipient` - Add allowed donation recipients",
        "`/admin remove_recipient` - Remove donation recipients"
      ].join("\n"),
      inline: false
    },
    {
      name: "📊 Monitoring & Analytics",
      value: [
        "`/admin dashboard` - View comprehensive admin dashboard",
        "`/admin analytics [type]` - Detailed analytics and statistics",
        "`/admin fix_achievements` - Fix achievement assignments",
        "`/admin clean_recipients` - Clean up recipient list"
      ].join("\n"),
      inline: false
    },
    {
      name: "🎁 Draw Management",
      value: [
        "`/admin create_draw` - Create new donation draws",
        "`/admin edit_draw` - Modify existing draws",
        "`/admin select_winner <draw_id>` - Select draw winners",
        "`/admin assign_entries` - Manually assign draw entries"
      ].join("\n"),
      inline: false
    },
    {
      name: "👥 User Management",
      value: [
        "`/admin blacklist` - Manage blacklisted users",
        "`/admin reset_user` - Reset user data",
        "`/admin bulk_operations` - Perform bulk user operations"
      ].join("\n"),
      inline: false
    }
  )

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("help_back")
        .setLabel("← Back to Main")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏠")
    )

  embed.setFooter({ text: "Powered By Aegisum Eco System • Admin Help" })

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [buttons] })
  } else {
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral })
  }
}

async function showDrawHelp(interaction, db) {
  const embed = new EmbedBuilder()
    .setTitle("🎁 Draw System - How It Works")
    .setDescription("**Learn how the donation draw system works and how to participate.**")
    .setColor("#4CAF50")

  embed.addFields(
    {
      name: "🎯 How Draws Work",
      value: [
        "• **Automatic Entry**: Donations automatically enter you into eligible draws",
        "• **Entry Calculation**: Entries = Donation Amount ÷ Minimum Amount",
        "• **Multiple Draws**: One donation can enter multiple draws",
        "• **Fair System**: More donations = more entries = better chances"
      ].join("\n"),
      inline: false
    },
    {
      name: "📋 Draw Commands",
      value: [
        "`/draws list` - View all available draws with details",
        "`/draws info <draw_id>` - Get detailed information about a specific draw",
        "`/draws leaderboard <draw_id>` - See who has the most entries",
        "`/draws ids` - Quick reference for all draw IDs"
      ].join("\n"),
      inline: false
    },
    {
      name: "🎮 Participation Tips",
      value: [
        "• **Check Requirements**: Some draws have minimum amounts or VIP requirements",
        "• **Select Draws**: Use `/user select_draw` to target specific draws",
        "• **Track Progress**: Use `/user entries` to see your current entries",
        "• **Stay Active**: Regular donations increase your chances"
      ].join("\n"),
      inline: false
    },
    {
      name: "🏆 Draw Types",
      value: [
        "• **Open Draws**: Anyone can participate",
        "• **VIP Draws**: Require special VIP role",
        "• **Minimum Amount**: Must donate at least the minimum",
        "• **Limited Entries**: Some draws have maximum entry limits"
      ].join("\n"),
      inline: false
    }
  )

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("help_back")
        .setLabel("← Back to Main")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏠")
    )

  embed.setFooter({ text: "Powered By Aegisum Eco System • Draw System Guide" })

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [buttons] })
  } else {
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral })
  }
}

async function showAchievementHelp(interaction, db) {
  const embed = new EmbedBuilder()
    .setTitle("🏆 Achievement System - Unlock Rewards")
    .setDescription("**Earn achievements by donating and participating in the community.**")
    .setColor("#FFD700")

  embed.addFields(
    {
      name: "🎖️ Achievement Categories",
      value: [
        "• **Donation Milestones**: Reach specific donation amounts",
        "• **Participation**: Regular donation activity",
        "• **Community**: Social engagement and referrals",
        "• **Special Events**: Limited-time achievements"
      ].join("\n"),
      inline: false
    },
    {
      name: "🏅 Available Achievements",
      value: [
        "🥇 **First Steps** - Make your first donation",
        "💰 **Generous Donor** - Donate $100 total",
        "💎 **Big Spender** - Donate $500 total",
        "🔥 **Donation Streak** - Donate 7 days in a row",
        "🎯 **Lucky Winner** - Win a draw",
        "👥 **Community Builder** - Refer 5 users",
        "⭐ **VIP Status** - Reach VIP donor level"
      ].join("\n"),
      inline: false
    },
    {
      name: "📊 Achievement Commands",
      value: [
        "`/achievements list` - View all available achievements",
        "`/achievements view [achievement]` - Get details about specific achievement",
        "`/achievements progress` - See your progress towards locked achievements",
        "`/user achievements` - View your earned achievements"
      ].join("\n"),
      inline: false
    },
    {
      name: "💡 Tips for Earning",
      value: [
        "• **Donate Regularly**: Many achievements require consistent activity",
        "• **Increase Amounts**: Higher donations unlock milestone achievements",
        "• **Stay Engaged**: Participate in community events",
        "• **Refer Friends**: Earn referral-based achievements"
      ].join("\n"),
      inline: false
    }
  )

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("help_back")
        .setLabel("← Back to Main")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏠")
    )

  embed.setFooter({ text: "Powered By Aegisum Eco System • Achievement Guide" })

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: [buttons] })
  } else {
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral })
  }
}

async function checkAdminPermissions(interaction, db) {
  const OWNER_ID = process.env.OWNER_ID || "659745190382141453"
  if (interaction.user.id === OWNER_ID) return true
  if (!db.config?.adminRoleId) return false

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id)
    return member.roles.cache.has(db.config.adminRoleId)
  } catch (error) {
    logger.error("Error checking admin permissions:", error)
    return false
  }
}
