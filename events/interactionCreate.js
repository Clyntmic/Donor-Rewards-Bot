import { logger } from "../utils/logger.js"

export const name = "interactionCreate"

export async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return

  const command = interaction.client.commands.get(interaction.commandName)

  if (!command) {
    logger.error(`No command matching ${interaction.commandName} was found.`)
    return
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    logger.error(`Error executing ${interaction.commandName}:`, error)

    const errorMessage = {
      content: "❌ There was an error while executing this command!",
      ephemeral: true,
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage)
      } else {
        await interaction.reply(errorMessage)
      }
    } catch (followUpError) {
      logger.error("Error sending error message:", followUpError)
    }
  }
}

