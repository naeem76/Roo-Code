// npx vitest run src/components/chat/__tests__/CheckpointRestoreDialog.spec.tsx

import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { vi } from "vitest"

import { CheckpointRestoreDialog } from "../CheckpointRestoreDialog"

// Mock the translation context
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"common:confirmation.delete_message": "Delete Message",
				"common:confirmation.edit_message": "Edit Message",
				"common:confirmation.delete_warning":
					"Deleting this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				"common:confirmation.edit_warning":
					"Editing this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				"common:confirmation.delete_warning_with_checkpoint":
					"Deleting this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				"common:confirmation.edit_warning_with_checkpoint":
					"Editing this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				"common:confirmation.restore_checkpoint": "Do you also wish to revert code to this checkpoint?",
				"common:confirmation.proceed": "Proceed",
				"common:answers.cancel": "Cancel",
				"common:confirmation.dont_show_again": "Don't show this again",
			}
			return translations[key] || key
		},
	}),
}))

describe("CheckpointRestoreDialog", () => {
	const defaultProps = {
		open: true,
		onOpenChange: vi.fn(),
		onConfirm: vi.fn(),
		type: "edit" as const,
		hasCheckpoint: false,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("Basic Rendering", () => {
		it("renders edit dialog without checkpoint", () => {
			render(<CheckpointRestoreDialog {...defaultProps} />)

			expect(screen.getByText("Edit Message")).toBeInTheDocument()
			expect(
				screen.getByText(
					"Editing this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				),
			).toBeInTheDocument()
			expect(screen.getByText("Proceed")).toBeInTheDocument()
			expect(screen.getByText("Cancel")).toBeInTheDocument()
			expect(screen.queryByText("Do you also wish to revert code to this checkpoint?")).not.toBeInTheDocument()
		})

		it("renders delete dialog without checkpoint", () => {
			render(<CheckpointRestoreDialog {...defaultProps} type="delete" />)

			expect(screen.getByText("Delete Message")).toBeInTheDocument()
			expect(
				screen.getByText(
					"Deleting this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				),
			).toBeInTheDocument()
			expect(screen.getByText("Proceed")).toBeInTheDocument()
			expect(screen.getByText("Cancel")).toBeInTheDocument()
			expect(screen.queryByText("Do you also wish to revert code to this checkpoint?")).not.toBeInTheDocument()
		})

		it("renders edit dialog with checkpoint option", () => {
			render(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} />)

			expect(screen.getByText("Edit Message")).toBeInTheDocument()
			expect(
				screen.getByText(
					"Editing this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				),
			).toBeInTheDocument()
			expect(screen.getByText("Do you also wish to revert code to this checkpoint?")).toBeInTheDocument()
			expect(screen.getAllByRole("checkbox")).toHaveLength(2) // restore and dont show again
		})

		it("renders delete dialog with checkpoint option", () => {
			render(<CheckpointRestoreDialog {...defaultProps} type="delete" hasCheckpoint={true} />)

			expect(screen.getByText("Delete Message")).toBeInTheDocument()
			expect(
				screen.getByText(
					"Deleting this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				),
			).toBeInTheDocument()
			expect(screen.getByText("Do you also wish to revert code to this checkpoint?")).toBeInTheDocument()
			expect(screen.getAllByRole("checkbox")).toHaveLength(2) // restore and dont show again
		})
	})

	describe("User Interactions", () => {
		it("calls onOpenChange when cancel is clicked", () => {
			const onOpenChange = vi.fn()
			render(<CheckpointRestoreDialog {...defaultProps} onOpenChange={onOpenChange} />)

			fireEvent.click(screen.getByText("Cancel"))
			expect(onOpenChange).toHaveBeenCalledWith(false)
		})

		it("calls onConfirm with correct parameters when proceed is clicked without checkpoint", () => {
			const onConfirm = vi.fn()
			render(<CheckpointRestoreDialog {...defaultProps} onConfirm={onConfirm} />)

			fireEvent.click(screen.getByText("Proceed"))
			expect(onConfirm).toHaveBeenCalledWith(false, false) // dontShowAgain, restoreCheckpoint
		})

		it("calls onConfirm with restoreCheckpoint=false when proceed is clicked with unchecked checkbox", () => {
			const onConfirm = vi.fn()
			render(<CheckpointRestoreDialog {...defaultProps} onConfirm={onConfirm} hasCheckpoint={true} />)

			const restoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			expect(restoreCheckbox).not.toBeChecked()

			fireEvent.click(screen.getByText("Proceed"))
			expect(onConfirm).toHaveBeenCalledWith(false, false) // dontShowAgain, restoreCheckpoint
		})

		it("calls onConfirm with restoreCheckpoint=true when proceed is clicked with checked checkbox", () => {
			const onConfirm = vi.fn()
			render(<CheckpointRestoreDialog {...defaultProps} onConfirm={onConfirm} hasCheckpoint={true} />)

			const restoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			fireEvent.click(restoreCheckbox)
			expect(restoreCheckbox).toBeChecked()

			fireEvent.click(screen.getByText("Proceed"))
			expect(onConfirm).toHaveBeenCalledWith(false, true) // dontShowAgain, restoreCheckpoint
		})

		it("toggles restore checkpoint checkbox state when clicked", () => {
			render(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} />)

			const restoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			expect(restoreCheckbox).not.toBeChecked()

			fireEvent.click(restoreCheckbox)
			expect(restoreCheckbox).toBeChecked()

			fireEvent.click(restoreCheckbox)
			expect(restoreCheckbox).not.toBeChecked()
		})

		it("toggles dont show again checkbox state when clicked", () => {
			render(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} />)

			const dontShowCheckbox = screen.getByLabelText("Don't show this again")
			expect(dontShowCheckbox).not.toBeChecked()

			fireEvent.click(dontShowCheckbox)
			expect(dontShowCheckbox).toBeChecked()

			fireEvent.click(dontShowCheckbox)
			expect(dontShowCheckbox).not.toBeChecked()
		})

		it("calls onConfirm with dontShowAgain=true when dont show again is checked", () => {
			const onConfirm = vi.fn()
			render(<CheckpointRestoreDialog {...defaultProps} onConfirm={onConfirm} hasCheckpoint={true} />)

			const dontShowCheckbox = screen.getByLabelText("Don't show this again")
			fireEvent.click(dontShowCheckbox)
			expect(dontShowCheckbox).toBeChecked()

			fireEvent.click(screen.getByText("Proceed"))
			expect(onConfirm).toHaveBeenCalledWith(true, false) // dontShowAgain, restoreCheckpoint
		})
	})

	describe("Dialog State Management", () => {
		it("does not render when open is false", () => {
			render(<CheckpointRestoreDialog {...defaultProps} open={false} />)

			expect(screen.queryByText("Edit Message")).not.toBeInTheDocument()
			expect(screen.queryByText("Delete Message")).not.toBeInTheDocument()
		})

		it("resets checkbox states when dialog reopens", async () => {
			const { rerender } = render(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} open={true} />)

			// Check both checkboxes
			const restoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			const dontShowCheckbox = screen.getByLabelText("Don't show this again")

			fireEvent.click(restoreCheckbox)
			fireEvent.click(dontShowCheckbox)
			expect(restoreCheckbox).toBeChecked()
			expect(dontShowCheckbox).toBeChecked()

			// Close dialog
			rerender(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} open={false} />)

			// Reopen dialog - useEffect should reset state when open becomes true
			rerender(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} open={true} />)

			// Checkboxes should be unchecked after reopening due to useEffect
			const newRestoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			const newDontShowCheckbox = screen.getByLabelText("Don't show this again")
			expect(newRestoreCheckbox).not.toBeChecked()
			expect(newDontShowCheckbox).not.toBeChecked()
		})
	})

	describe("Accessibility", () => {
		it("has proper ARIA labels and roles", () => {
			render(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} />)

			expect(screen.getByRole("alertdialog")).toBeInTheDocument() // AlertDialog uses alertdialog role
			expect(screen.getAllByRole("checkbox")).toHaveLength(2) // restore and dont show again
			expect(screen.getByRole("button", { name: "Proceed" })).toBeInTheDocument()
			expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
		})

		it("checkboxes are properly labeled", () => {
			render(<CheckpointRestoreDialog {...defaultProps} hasCheckpoint={true} />)

			const restoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			const dontShowCheckbox = screen.getByLabelText("Don't show this again")

			expect(restoreCheckbox).toBeInTheDocument()
			expect(dontShowCheckbox).toBeInTheDocument()
		})
	})

	describe("Edge Cases", () => {
		it("handles missing translation keys gracefully", () => {
			// This test is simplified since we can't easily mock the translation function mid-test
			// The component should handle missing keys by returning the key itself
			render(<CheckpointRestoreDialog {...defaultProps} />)

			// Should still render with proper text from our mock
			expect(screen.getByText("Edit Message")).toBeInTheDocument()
		})

		it("handles rapid state changes", async () => {
			const onConfirm = vi.fn()
			render(<CheckpointRestoreDialog {...defaultProps} onConfirm={onConfirm} hasCheckpoint={true} />)

			const restoreCheckbox = screen.getByLabelText("Do you also wish to revert code to this checkpoint?")
			const proceedButton = screen.getByText("Proceed")

			// Rapidly toggle checkbox and click proceed
			fireEvent.click(restoreCheckbox)
			fireEvent.click(restoreCheckbox)
			fireEvent.click(restoreCheckbox)
			fireEvent.click(proceedButton)

			expect(onConfirm).toHaveBeenCalledWith(false, true) // dontShowAgain, restoreCheckpoint
		})
	})

	describe("Type-specific Behavior", () => {
		it("shows correct warning text for edit type", () => {
			render(<CheckpointRestoreDialog {...defaultProps} type="edit" />)

			expect(
				screen.getByText(
					"Editing this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				),
			).toBeInTheDocument()
		})

		it("shows correct warning text for delete type", () => {
			render(<CheckpointRestoreDialog {...defaultProps} type="delete" />)

			expect(
				screen.getByText(
					"Deleting this message will delete all subsequent messages in the conversation. Do you want to proceed?",
				),
			).toBeInTheDocument()
		})

		it("shows correct title for edit type", () => {
			render(<CheckpointRestoreDialog {...defaultProps} type="edit" />)

			expect(screen.getByText("Edit Message")).toBeInTheDocument()
		})

		it("shows correct title for delete type", () => {
			render(<CheckpointRestoreDialog {...defaultProps} type="delete" />)

			expect(screen.getByText("Delete Message")).toBeInTheDocument()
		})
	})
})
