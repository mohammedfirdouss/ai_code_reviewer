import { WebSocketMessage, ReviewState } from "../types";
import { CodeReviewService } from "./code-review-service";

export class WebSocketHandler {
  private state: ReviewState;
  private env: any;
  
  constructor(state: ReviewState, env: any) {
    this.state = state;
    this.env = env;
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(message as string);
      
      switch (data.type) {
        case "submit_code":
          await this.handleCodeReview(ws, data);
          break;
          
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
          
        case "list_reviews":
          ws.send(JSON.stringify({ 
            type: "reviews", 
            reviews: this.state.reviews 
          }));
          break;
          
        case "get_history":
          ws.send(JSON.stringify({ 
            type: "history", 
            history: this.state.history 
          }));
          break;
          
        default:
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Unknown message type" 
          }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ 
        type: "error", 
        error: error instanceof Error ? error.message : "Unknown error"
      }));
    }
  }
  
  /**
   * Handle code review requests
   */
  async handleCodeReview(ws: WebSocket, data: any) {
    const { code, category, language } = data;
    
    // Add to conversation history
    this.state.history.push({
      role: "user",
      content: `Review this ${language || 'code'} (${category} analysis):\n${code.slice(0, 500)}...`,
      timestamp: Date.now()
    });
    
    // Send initial acknowledgment
    ws.send(JSON.stringify({ 
      type: "stream", 
      stage: "init",
      text: `Starting ${category} review for ${language || 'code'}...` 
    }));

    try {
      // Perform the review using our service
      const fullResponse = await CodeReviewService.performReview(
        this.env.AI, 
        { code, category, language },
        (chunk) => {
          ws.send(JSON.stringify({ 
            type: "stream", 
            stage: "analysis",
            text: chunk 
          }));
        }
      );
      
      // Save the review
      const reviewId = CodeReviewService.generateReviewId();
      const review = {
        id: reviewId,
        code: code.slice(0, 2000),
        category,
        result: fullResponse,
        timestamp: Date.now()
      };
      
      this.state.reviews.push(review);
      this.state.history.push({
        role: "assistant",
        content: fullResponse.slice(0, 500),
        timestamp: Date.now()
      });

      // Send completion
      ws.send(JSON.stringify({ 
        type: "done", 
        review 
      }));

    } catch (error) {
      ws.send(JSON.stringify({ 
        type: "error", 
        error: error instanceof Error ? error.message : "AI model error"
      }));
    }
  }
}