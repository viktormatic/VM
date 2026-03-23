import { logger } from "./logger.js"

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN"
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeout: number
  successThreshold: number
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly resetAt?: number,
  ) {
    super(message)
    this.name = "CircuitBreakerError"
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures = 0
  private successes = 0
  private lastFailureTime = 0
  private nextAttemptTime = 0

  constructor(
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 2,
    },
  ) {
    logger.info("Circuit breaker initialized", {
      failureThreshold: config.failureThreshold,
      resetTimeout: config.resetTimeout,
      successThreshold: config.successThreshold,
    })
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState()
    if (this.state === CircuitState.OPEN) {
      const waitTime = this.nextAttemptTime - Date.now()
      logger.warn("Circuit breaker is open - failing fast", { state: this.state, failures: this.failures, waitTimeMs: waitTime, nextAttemptTime: new Date(this.nextAttemptTime).toISOString() })
      throw new CircuitBreakerError(`Circuit breaker is open - API temporarily unavailable. Try again in ${Math.ceil(waitTime / 1000)}s`, CircuitState.OPEN, this.nextAttemptTime)
    }
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private checkState(): void {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now()
      if (now >= this.nextAttemptTime) {
        logger.info("Circuit breaker transitioning to HALF_OPEN", { previousState: CircuitState.OPEN, failures: this.failures, timeSinceLastFailure: now - this.lastFailureTime })
        this.state = CircuitState.HALF_OPEN
        this.successes = 0
      }
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++
      logger.debug("Circuit breaker success in HALF_OPEN", { successes: this.successes, successThreshold: this.config.successThreshold })
      if (this.successes >= this.config.successThreshold) {
        logger.info("Circuit breaker closing - service recovered", { previousState: CircuitState.HALF_OPEN, successCount: this.successes, totalFailures: this.failures })
        this.reset()
      }
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures > 0) {
        logger.debug("Circuit breaker resetting failure count", { previousFailures: this.failures })
        this.failures = 0
      }
    }
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()
    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn("Circuit breaker opening - failure in HALF_OPEN", { previousState: CircuitState.HALF_OPEN, totalFailures: this.failures })
      this.openCircuit()
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        logger.warn("Circuit breaker opening - failure threshold reached", { previousState: CircuitState.CLOSED, failures: this.failures, threshold: this.config.failureThreshold })
        this.openCircuit()
      } else {
        logger.debug("Circuit breaker failure recorded", { state: CircuitState.CLOSED, failures: this.failures, threshold: this.config.failureThreshold })
      }
    }
  }

  private openCircuit(): void {
    this.state = CircuitState.OPEN
    this.nextAttemptTime = Date.now() + this.config.resetTimeout
    this.successes = 0
  }

  private reset(): void {
    this.state = CircuitState.CLOSED
    this.failures = 0
    this.successes = 0
    this.lastFailureTime = 0
    this.nextAttemptTime = 0
  }

  getStatus(): { state: CircuitState; failures: number; successes: number; nextAttemptTime: number | null } {
    return { state: this.state, failures: this.failures, successes: this.successes, nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : null }
  }
}
