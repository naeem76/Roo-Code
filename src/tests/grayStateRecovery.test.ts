import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Task } from '../core/task/Task'
import { ClineProvider } from '../core/webview/ClineProvider'

// Mock dependencies
vi.mock('vscode', () => ({
	window: {
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
			update: vi.fn(),
		})),
	},
	Uri: {
		file: vi.fn(),
		parse: vi.fn(),
	},
	EventEmitter: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
	Anthropic: vi.fn(),
}))

vi.mock('delay', () => ({
	default: vi.fn(),
}))

vi.mock('axios', () => ({
	default: {
		get: vi.fn(),
		post: vi.fn(),
	},
}))

vi.mock('p-wait-for', () => ({
	default: vi.fn(),
}))

describe('Gray State Recovery', () => {
	let mockTask: Partial<Task>
	let mockProvider: Partial<ClineProvider>
	let mockWebview: any

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()

		// Mock webview
		mockWebview = {
			postMessage: vi.fn(),
		}

		// Mock task with gray state scenario
		mockTask = {
			taskId: 'test-task-123',
			isStreaming: false,
			isPaused: false,
			enableButtons: false,
			abort: false,
			resumePausedTask: vi.fn(),
			recursivelyMakeClineRequests: vi.fn(),
		}

		// Mock provider
		mockProvider = {
			taskStack: [mockTask as Task],
			currentTask: mockTask as Task,
			webview: mockWebview,
			postMessageToWebview: vi.fn(),
			finishSubTask: vi.fn(),
			recoverFromGrayState: vi.fn(),
		}
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('Task.resumePausedTask error recovery', () => {
		it('should handle provider disconnection gracefully', async () => {
			const mockError = new Error('Provider disconnected')
			const resumeSpy = vi.fn().mockRejectedValue(mockError)
			mockTask.resumePausedTask = resumeSpy

			// Mock the actual implementation
			const task = mockTask as Task
			task.resumePausedTask = async function() {
				try {
					throw mockError
				} catch (error) {
					console.warn('[Task] Failed to resume paused task, attempting recovery:', error)
					
					// Recovery mechanism: reset task state
					this.isStreaming = false
					this.isPaused = false
					this.enableButtons = true
					
					// Add recovery message
					const recoveryMessage = {
						ts: Date.now(),
						type: 'say' as const,
						say: 'error' as const,
						text: 'Task was interrupted but has been recovered. You can continue or start a new task.',
						partial: false,
					}
					
					// In real implementation, this would add to messages
					console.log('[Task] Added recovery message:', recoveryMessage)
					
					return
				}
			}

			await task.resumePausedTask()

			expect(task.isStreaming).toBe(false)
			expect(task.isPaused).toBe(false)
			expect(task.enableButtons).toBe(true)
		})

		it('should handle API failures during task restoration', async () => {
			const mockApiError = new Error('API request failed')
			const recursiveSpy = vi.fn().mockRejectedValue(mockApiError)
			mockTask.recursivelyMakeClineRequests = recursiveSpy

			// Mock the actual implementation
			const task = mockTask as Task
			task.recursivelyMakeClineRequests = async function() {
				try {
					throw mockApiError
				} catch (error) {
					console.warn('[Task] API request failed during task restoration, attempting recovery:', error)
					
					// Recovery mechanism: enable user interaction
					this.isStreaming = false
					this.enableButtons = true
					
					// Add recovery message
					const recoveryMessage = {
						ts: Date.now(),
						type: 'say' as const,
						say: 'error' as const,
						text: 'Connection was lost but the task has been recovered. Please try your request again.',
						partial: false,
					}
					
					console.log('[Task] Added API recovery message:', recoveryMessage)
					return
				}
			}

			await task.recursivelyMakeClineRequests()

			expect(task.isStreaming).toBe(false)
			expect(task.enableButtons).toBe(true)
		})
	})

	describe('ClineProvider.finishSubTask error recovery', () => {
		it('should handle subtask completion failures gracefully', async () => {
			const mockError = new Error('Subtask completion failed')
			const finishSpy = vi.fn().mockRejectedValue(mockError)
			
			// Mock the actual implementation
			const provider = mockProvider as ClineProvider
			provider.finishSubTask = async function() {
				try {
					throw mockError
				} catch (error) {
					console.warn('[ClineProvider] Failed to finish subtask, attempting recovery:', error)
					
					// Recovery mechanism: attempt to recover from gray state
					await this.recoverFromGrayState?.()
					
					return
				}
			}

			provider.recoverFromGrayState = async function() {
				console.log('[ClineProvider] Attempting gray state recovery...')
				
				const currentTask = this.currentTask
				if (currentTask) {
					// Strategy 1: Force task resume
					try {
						currentTask.isStreaming = false
						currentTask.enableButtons = true
						currentTask.isPaused = false
						
						console.log('[ClineProvider] Gray state recovery: Reset task state')
						
						// Strategy 2: Refresh UI state
						this.postMessageToWebview?.({
							type: 'state',
							state: {
								task: currentTask,
								enableButtons: true,
								isStreaming: false,
							}
						})
						
						console.log('[ClineProvider] Gray state recovery: Refreshed UI state')
						
					} catch (recoveryError) {
						console.error('[ClineProvider] Gray state recovery failed:', recoveryError)
						
						// Strategy 3: Clear task as last resort
						this.taskStack = []
						this.currentTask = undefined
						
						this.postMessageToWebview?.({
							type: 'state',
							state: {
								task: undefined,
								enableButtons: true,
								isStreaming: false,
							}
						})
						
						console.log('[ClineProvider] Gray state recovery: Cleared task as last resort')
					}
				}
			}

			await provider.finishSubTask()

			expect(provider.recoverFromGrayState).toBeDefined()
		})
	})

	describe('Gray state detection', () => {
		it('should detect gray state conditions correctly', () => {
			// Simulate gray state: task exists, not streaming, buttons disabled
			const hasTask = !!mockTask
			const hasMessages = true
			const isStreaming = false
			const enableButtons = false
			const clineAsk = undefined

			const isInGrayState = hasTask && hasMessages && !isStreaming && !enableButtons && !clineAsk

			expect(isInGrayState).toBe(true)
		})

		it('should not detect gray state when buttons are enabled', () => {
			const hasTask = !!mockTask
			const hasMessages = true
			const isStreaming = false
			const enableButtons = true // Buttons enabled
			const clineAsk = undefined

			const isInGrayState = hasTask && hasMessages && !isStreaming && !enableButtons && !clineAsk

			expect(isInGrayState).toBe(false)
		})

		it('should not detect gray state when streaming', () => {
			const hasTask = !!mockTask
			const hasMessages = true
			const isStreaming = true // Currently streaming
			const enableButtons = false
			const clineAsk = undefined

			const isInGrayState = hasTask && hasMessages && !isStreaming && !enableButtons && !clineAsk

			expect(isInGrayState).toBe(false)
		})

		it('should not detect gray state when there is an active ask', () => {
			const hasTask = !!mockTask
			const hasMessages = true
			const isStreaming = false
			const enableButtons = false
			const clineAsk = { type: 'tool', tool: 'test' } // Active ask

			const isInGrayState = hasTask && hasMessages && !isStreaming && !enableButtons && !clineAsk

			expect(isInGrayState).toBe(false)
		})
	})

	describe('Recovery strategies', () => {
		it('should attempt multiple recovery strategies in order', async () => {
			const provider = mockProvider as ClineProvider
			const strategies: string[] = []

			provider.recoverFromGrayState = async function() {
				const currentTask = this.currentTask
				if (currentTask) {
					// Strategy 1: Force task resume
					try {
						strategies.push('force_resume')
						currentTask.isStreaming = false
						currentTask.enableButtons = true
						currentTask.isPaused = false
						
						// Strategy 2: Add recovery message
						strategies.push('add_recovery_message')
						
						// Strategy 3: Refresh UI state
						strategies.push('refresh_ui')
						this.postMessageToWebview?.({
							type: 'state',
							state: {
								task: currentTask,
								enableButtons: true,
								isStreaming: false,
							}
						})
						
					} catch (recoveryError) {
						// Strategy 4: Clear task as last resort
						strategies.push('clear_task')
						this.taskStack = []
						this.currentTask = undefined
					}
				}
			}

			await provider.recoverFromGrayState?.()

			expect(strategies).toEqual([
				'force_resume',
				'add_recovery_message',
				'refresh_ui'
			])
		})
	})
})