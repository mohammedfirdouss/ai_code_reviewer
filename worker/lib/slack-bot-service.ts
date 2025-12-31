import { Env } from '../types';

/**
 * Slack Bot Integration for AI Code Reviewer
 * 
 * Features:
 * - Slash commands for code review
 * - Review notifications
 * - Team integration
 */

export interface SlackEvent {
  type: string;
  event?: {
    type: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
  };
  command?: string;
  text?: string;
  user_id?: string;
  channel_id?: string;
  response_url?: string;
}

export class SlackBotService {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Handle incoming Slack events and slash commands
   */
  async handleSlackEvent(event: SlackEvent): Promise<Response> {
    try {
      // Handle slash commands
      if (event.command) {
        return await this.handleSlashCommand(event);
      }
      
      // Handle events (mentions, reactions, etc.)
      if (event.type === 'event_callback' && event.event) {
        return await this.handleEvent(event.event);
      }
      
      // URL verification for initial setup
      if (event.type === 'url_verification') {
        return new Response((event as any).challenge, {
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      return new Response('OK', { status: 200 });
      
    } catch (error: any) {
      console.error('Slack event handling error:', error);
      return new Response('Error processing request', { status: 500 });
    }
  }

  /**
   * Handle slash commands like /review-code
   */
  private async handleSlashCommand(event: SlackEvent): Promise<Response> {
    const { command, text = '', user_id, channel_id, response_url } = event;
    
    switch (command) {
      case '/review-code':
        return await this.handleReviewCommand(text, user_id!, channel_id!, response_url!);
      
      case '/ai-help':
        return await this.handleHelpCommand(user_id!, channel_id!);
      
      default:
        return new Response('Unknown command', { status: 400 });
    }
  }

  /**
   * Handle /review-code command
   */
  private async handleReviewCommand(
    text: string, 
    userId: string, 
    channelId: string, 
    responseUrl: string
  ): Promise<Response> {
    // Acknowledge the command immediately
    await this.sendResponse(responseUrl, {
      response_type: 'in_channel',
      text: '🤖 AI Code Reviewer is analyzing your code...'
    });

    try {
      // Parse the command text
      const parsed = this.parseReviewCommand(text);
      
      if (!parsed.code) {
        await this.sendResponse(responseUrl, {
          response_type: 'ephemeral',
          text: 'Please provide code to review. Usage: `/review-code language:javascript \\`\\`\\`your code here\\`\\`\\``'
        });
        return new Response('OK');
      }

      // Perform the review
      const reviewResult = await this.performCodeReview(parsed.code, parsed.language, parsed.category);
      
      // Send the review result
      await this.sendReviewResult(responseUrl, reviewResult, userId);
      
    } catch (error: any) {
      await this.sendResponse(responseUrl, {
        response_type: 'ephemeral', 
        text: `❌ Review failed: ${error.message}`
      });
    }

    return new Response('OK');
  }

  /**
   * Handle /ai-help command
   */
  private async handleHelpCommand(userId: string, channelId: string): Promise<Response> {
    const helpText = {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🤖 AI Code Reviewer Help*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Commands:*\\n• `/review-code` - Review code snippet\\n• `/ai-help` - Show this help'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Usage Examples:*\\n• `/review-code language:javascript \\`\\`\\`function hello() { console.log("hi"); }\\`\\`\\``\\n• `/review-code language:python category:security \\`\\`\\`def login(password): if password == "123": return True\\`\\`\\``'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Categories:* `quick` (default), `security`, `performance`, `documentation`'
          }
        }
      ]
    };

    return new Response(JSON.stringify(helpText), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Handle Slack events (mentions, reactions, etc.)
   */
  private async handleEvent(event: any): Promise<Response> {
    switch (event.type) {
      case 'app_mention':
        await this.handleMention(event);
        break;
      
      case 'message':
        if (event.text?.includes('review this code')) {
          await this.handleCodeReviewRequest(event);
        }
        break;
    }

    return new Response('OK');
  }

  /**
   * Handle bot mentions
   */
  private async handleMention(event: any): Promise<void> {
    const { channel, user, text } = event;
    
    // Look for code blocks in the mention
    const codeMatch = text.match(/```(\\w+)?\\n([\\s\\S]+?)```/);
    
    if (codeMatch) {
      const language = codeMatch[1] || 'javascript';
      const code = codeMatch[2];
      
      try {
        const reviewResult = await this.performCodeReview(code, language);
        await this.postMessage(channel, this.formatReviewForSlack(reviewResult, user));
      } catch (error: any) {
        await this.postMessage(channel, `❌ Sorry <@${user}>, I couldn't review that code: ${error.message}`);
      }
    } else {
      await this.postMessage(channel, `Hi <@${user}>! 👋 Send me code in a code block and I'll review it for you!`);
    }
  }

  /**
   * Parse review command text
   */
  private parseReviewCommand(text: string) {
    const result = {
      language: 'javascript',
      category: 'quick',
      code: ''
    };

    // Extract language
    const langMatch = text.match(/language:(\\w+)/);
    if (langMatch) {
      result.language = langMatch[1];
    }

    // Extract category  
    const categoryMatch = text.match(/category:(\\w+)/);
    if (categoryMatch) {
      result.category = categoryMatch[1];
    }

    // Extract code block
    const codeMatch = text.match(/```([\\s\\S]+?)```/);
    if (codeMatch) {
      result.code = codeMatch[1].trim();
    }

    return result;
  }

  /**
   * Perform code review using the main service
   */
  private async performCodeReview(code: string, language: string, category: string = 'quick') {
    const response = await fetch(`${this.env.API_BASE_URL || 'https://ai-code-reviewer.pages.dev'}/api/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language,
        category,
        source: 'slack'
      })
    });

    if (!response.ok) {
      throw new Error(`Review service error: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Format review result for Slack
   */
  private formatReviewForSlack(reviewResult: any, userId?: string) {
    const confidenceColor = reviewResult.confidence > 80 ? 'good' : 
                           reviewResult.confidence > 60 ? 'warning' : 'danger';

    return {
      text: userId ? `Review for <@${userId}>` : 'Code Review Result',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🤖 AI Code Review Result*${userId ? ` for <@${userId}>` : ''}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Model:* ${reviewResult.model}`
            },
            {
              type: 'mrkdwn',
              text: `*Confidence:* ${reviewResult.confidence}%`
            },
            {
              type: 'mrkdwn',
              text: `*Processing Time:* ${reviewResult.processingTime}ms`
            },
            {
              type: 'mrkdwn',
              text: `*Category:* ${reviewResult.category}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Review:*\\n${reviewResult.review}`
          }
        }
      ],
      attachments: [
        {
          color: confidenceColor,
          fields: [
            {
              title: 'Confidence Score',
              value: `${reviewResult.confidence}%`,
              short: true
            }
          ]
        }
      ]
    };
  }

  /**
   * Send review result to response URL
   */
  private async sendReviewResult(responseUrl: string, reviewResult: any, userId: string): Promise<void> {
    const message = this.formatReviewForSlack(reviewResult, userId);
    await this.sendResponse(responseUrl, {
      response_type: 'in_channel',
      ...message
    });
  }

  /**
   * Send response to Slack response URL
   */
  private async sendResponse(responseUrl: string, message: any): Promise<void> {
    await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });
  }

  /**
   * Post message to Slack channel
   */
  private async postMessage(channel: string, message: any): Promise<void> {
    if (!this.env.SLACK_BOT_TOKEN) {
      console.warn('SLACK_BOT_TOKEN not configured');
      return;
    }

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        ...(typeof message === 'string' ? { text: message } : message)
      })
    });
  }

  /**
   * Handle code review requests in messages
   */
  private async handleCodeReviewRequest(event: any): Promise<void> {
    // Look for code blocks in the message
    const codeMatch = event.text.match(/```(\\w+)?\\n([\\s\\S]+?)```/);
    
    if (codeMatch) {
      const language = codeMatch[1] || 'javascript';
      const code = codeMatch[2];
      
      try {
        const reviewResult = await this.performCodeReview(code, language);
        await this.postMessage(event.channel, this.formatReviewForSlack(reviewResult, event.user));
      } catch (error: any) {
        await this.postMessage(event.channel, `❌ Sorry, I couldn't review that code: ${error.message}`);
      }
    }
  }

  /**
   * Send code review notification to team channels
   */
  async sendReviewNotification(channelId: string, review: any): Promise<void> {
    const message = {
      text: '📝 New Code Review Completed',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📝 Code Review Completed*'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Language:* ${review.language}`
            },
            {
              type: 'mrkdwn',
              text: `*Confidence:* ${review.confidence}%`
            }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Full Review'
              },
              url: `https://ai-code-reviewer.pages.dev/review/${review.id}`
            }
          ]
        }
      ]
    };

    await this.postMessage(channelId, message);
  }
}