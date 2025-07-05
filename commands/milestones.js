import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"

export const data = new SlashCommandBuilder()
  .setName("milestones")
  .setDescription("View donation milestones and progress")
  .addSubcommand(subcommand =>
    subcommand
      .setName("list")
      .setDescription("View all available milestones")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("progress")
      .setDescription("View your milestone progress")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("rewards")
      .setDescription("View milestone rewards")
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case "list":
        await handleListMilestones(interaction, db)
        break
      case "progress":
        await handleProgress(interaction, db)
        break
      case "rewards":
        await handleRewards(interaction, db)
        break
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error("Error in milestones command:", error)
    
    const errorMessage = {
      content: "❌ An error occurred while fetching milestone information.",
      flags: MessageFlags.Ephemeral,
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    } catch (followUpError) {
      logger.error("Error sending milestones error message:", followUpError)
    }
  }
}

const MILESTONES = [
  { amount: 1, reward: "First Donor Badge", description: "Welcome to the community!" },
  { amount: 5, reward: "Bronze Supporter", description: "Thank you for your support!" },
  { amount: 10, reward: "Consistent Donor", description: "You're making a difference!" },
  { amount: 25, reward: "Silver Supporter", description: "Your generosity is appreciated!" },
  { amount: 50, reward: "Gold Supporter", description: "You're a valued community member!" },
  { amount: 100, reward: "Platinum Supporter", description: "Your dedication is inspiring!" },
  { amount: 250, reward: "Diamond Supporter", description: "You're a pillar of the community!" },
  { amount: 500, reward: "Elite Donor", description: "Your impact is immeasurable!" },
  { amount: 1000, reward: "Legendary Benefactor", description: "You're a true legend!" },
  { amount: 2500, reward: "Ultimate Patron", description: "Your legacy will be remembered!" }
]

async function handleListMilestones(interaction, db) {
  const embed = new EmbedBuilder()
    .setTitle("🎯 Donation Milestones")
    .setDescription("Reach these donation amounts to unlock special rewards!")
    .setColor(db.config?.theme?.primary || "#4CAF50")

  let milestonesText = ""
  for (const milestone of MILESTONES) {
    milestonesText += `💰 **$${milestone.amount}** - ${milestone.reward}\n${milestone.description}\n\n`
  }

  embed.addFields({
    name: "Available Milestones",
    value: milestonesText,
    inline: false,
  })

  embed.addFields({
    name: "💡 How It Works",
    value: "Milestones are based on your total donation amount. Once you reach a milestone, you'll automatically receive the reward!",
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleProgress(interaction, db) {
  const userId = interaction.user.id
  const userData = db.users?.[userId]

  if (!userData) {
    return interaction.reply({
      content: "❌ You haven't made any donations yet. Make your first donation to start tracking milestones!",
      flags: MessageFlags.Ephemeral,
    })
  }

  const totalDonated = userData.totalDonated || 0
  const completedMilestones = userData.milestones || []

  // Find current and next milestone
  let currentMilestone = null
  let nextMilestone = null

  for (const milestone of MILESTONES) {
    if (totalDonated >= milestone.amount) {
      currentMilestone = milestone
    } else if (!nextMilestone) {
      nextMilestone = milestone
      break
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("📊 Your Milestone Progress")
    .setDescription(`Total donated: **$${totalDonated.toFixed(2)}**`)
    .setColor(db.config?.theme?.accent || "#FF9800")

  if (currentMilestone) {
    embed.addFields({
      name: "🏅 Current Milestone",
      value: `**${currentMilestone.reward}** ($${currentMilestone.amount})\n${currentMilestone.description}`,
      inline: true,
    })
  }

  if (nextMilestone) {
    const needed = nextMilestone.amount - totalDonated
    const progress = (totalDonated / nextMilestone.amount) * 100
    const progressBar = createProgressBar(progress)
    
    embed.addFields({
      name: "🎯 Next Milestone",
      value: `**${nextMilestone.reward}** ($${nextMilestone.amount})\nNeed: $${needed.toFixed(2)} more\n${progressBar} ${progress.toFixed(1)}%`,
      inline: true,
    })
  } else {
    embed.addFields({
      name: "🎉 Congratulations!",
      value: "You've completed all available milestones!",
      inline: true,
    })
  }

  // Show completed milestones
  const completedText = MILESTONES
    .filter(m => totalDonated >= m.amount)
    .map(m => `✅ ${m.reward} ($${m.amount})`)
    .join("\n") || "None yet"

  embed.addFields({
    name: "🏆 Completed Milestones",
    value: completedText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

async function handleRewards(interaction, db) {
  const userId = interaction.user.id
  const userData = db.users?.[userId]
  const totalDonated = userData?.totalDonated || 0

  const embed = new EmbedBuilder()
    .setTitle("🎁 Milestone Rewards")
    .setDescription("Special rewards for reaching donation milestones")
    .setColor(db.config?.theme?.special || "#E91E63")

  let rewardsText = ""
  for (const milestone of MILESTONES) {
    const status = totalDonated >= milestone.amount ? "✅" : "❌"
    const unlocked = totalDonated >= milestone.amount ? " (UNLOCKED)" : ""
    
    rewardsText += `${status} **$${milestone.amount}** - ${milestone.reward}${unlocked}\n`
  }

  embed.addFields({
    name: "🏆 All Milestone Rewards",
    value: rewardsText,
    inline: false,
  })

  embed.addFields({
    name: "💡 Reward Benefits",
    value: [
      "• **Special Discord Roles** - Show off your donor status",
      "• **Exclusive Access** - VIP channels and features",
      "• **Bonus Entries** - Extra chances in special draws",
      "• **Recognition** - Featured in donor spotlights",
      "• **Early Access** - First to know about new features"
    ].join("\n"),
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  await interaction.reply({ embeds: [embed] })
}

function createProgressBar(percentage) {
  const totalBars = 10
  const filledBars = Math.round((percentage / 100) * totalBars)
  const emptyBars = totalBars - filledBars
  
  return "█".repeat(filledBars) + "░".repeat(emptyBars)
}