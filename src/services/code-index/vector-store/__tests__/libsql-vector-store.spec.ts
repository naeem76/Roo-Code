// npx vitest services/code-index/vector-store/__tests__/libsql-vector-store.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { LibSQLVectorStore } from "../libsql-vector-store"
import { PointStruct } from "../../interfaces/vector-store"
import * as fs from "fs"
import * as path from "path"

// Mock @mastra/libsql
const mockLibSQLVector = {
	createIndex: vi.fn(),
	listIndexes: vi.fn(),
	upsert: vi.fn(),
	query: vi.fn(),
	deleteVector: vi.fn(),
	truncateIndex: vi.fn(),
	deleteIndex: vi.fn(),
}

vi.mock("@mastra/libsql", () => ({
	LibSQLVector: vi.fn().mockImplementation(() => mockLibSQLVector),
}))

// Mock fs
vi.mock("fs", () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	rmSync: vi.fn(),
}))

// Mock path
vi.mock("path", () => ({
	dirname: vi.fn(),
	sep: "/",
}))

describe("LibSQLVectorStore", () => {
	let vectorStore: LibSQLVectorStore
	let mockLibSQLVector: any
	const testDbPath = "/tmp/test-vector-store.db"
	const testIndexName = "test_index"
	const testDimension = 384

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock fs methods
		const fs = require("fs")
		fs.existsSync.mockReturnValue(true)
		fs.mkdirSync.mockReturnValue(undefined)

		// Mock path methods
		const path = require("path")
		path.dirname.mockReturnValue("/tmp")

		// Reset mock functions
		mockLibSQLVector.createIndex.mockReset()
		mockLibSQLVector.listIndexes.mockReset()
		mockLibSQLVector.upsert.mockReset()
		mockLibSQLVector.query.mockReset()
		mockLibSQLVector.deleteVector.mockReset()
		mockLibSQLVector.truncateIndex.mockReset()
		mockLibSQLVector.deleteIndex.mockReset()

		vectorStore = new LibSQLVectorStore("test-workspace", testDbPath, testDimension)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("constructor", () => {
		it("should initialize with correct parameters", () => {
			const { LibSQLVector } = require("@mastra/libsql")
			expect(LibSQLVector).toHaveBeenCalledWith(testDbPath)
		})

		it("should store configuration parameters", () => {
			expect(vectorStore).toBeDefined()
		})
	})

	describe("initialize", () => {
		it("should create index with correct parameters", async () => {
			mockLibSQLVector.listIndexes.mockResolvedValue([])
			mockLibSQLVector.createIndex.mockResolvedValue(undefined)

			const result = await vectorStore.initialize()

			expect(mockLibSQLVector.listIndexes).toHaveBeenCalled()
			expect(mockLibSQLVector.createIndex).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				dimension: testDimension,
			})
			expect(result).toBe(true)
		})

		it("should not create index if it already exists", async () => {
			mockLibSQLVector.listIndexes.mockResolvedValue([{ name: "ws_1234567890abcdef" }])

			const result = await vectorStore.initialize()

			expect(mockLibSQLVector.listIndexes).toHaveBeenCalled()
			expect(mockLibSQLVector.createIndex).not.toHaveBeenCalled()
			expect(result).toBe(false)
		})

		it("should handle initialization errors", async () => {
			const error = new Error("Failed to create index")
			mockLibSQLVector.listIndexes.mockRejectedValue(error)

			await expect(vectorStore.initialize()).rejects.toThrow()
		})
	})

	describe("upsertPoints", () => {
		const testPoints: PointStruct[] = [
			{
				id: "test-1",
				vector: [0.1, 0.2, 0.3, 0.4],
				payload: {
					filePath: "/test/file1.ts",
					codeChunk: "test content 1",
					startLine: 1,
					endLine: 10,
				},
			},
			{
				id: "test-2",
				vector: [0.5, 0.6, 0.7, 0.8],
				payload: {
					filePath: "/test/file2.ts",
					codeChunk: "test content 2",
					startLine: 11,
					endLine: 20,
				},
			},
		]

		beforeEach(async () => {
			mockLibSQLVector.listIndexes.mockResolvedValue([])
			mockLibSQLVector.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should upsert points correctly", async () => {
			mockLibSQLVector.upsert.mockResolvedValue(undefined)

			await vectorStore.upsertPoints(testPoints)

			expect(mockLibSQLVector.upsert).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				vectors: [
					[0.1, 0.2, 0.3, 0.4],
					[0.5, 0.6, 0.7, 0.8],
				],
				ids: ["test-1", "test-2"],
				metadata: [
					{
						filePath: "/test/file1.ts",
						codeChunk: "test content 1",
						startLine: 1,
						endLine: 10,
						pathSegments: ["test", "file1.ts"],
					},
					{
						filePath: "/test/file2.ts",
						codeChunk: "test content 2",
						startLine: 11,
						endLine: 20,
						pathSegments: ["test", "file2.ts"],
					},
				],
			})
		})

		it("should handle empty points array", async () => {
			await vectorStore.upsertPoints([])

			expect(mockLibSQLVector.upsert).not.toHaveBeenCalled()
		})

		it("should handle upsert errors", async () => {
			const error = new Error("Upsert failed")
			mockLibSQLVector.upsert.mockRejectedValue(error)

			await expect(vectorStore.upsertPoints(testPoints)).rejects.toThrow(
				"Failed to upsert points to LibSQL vector store: Upsert failed",
			)
		})

		it("should handle points with missing payload fields", async () => {
			const pointsWithMissingFields: PointStruct[] = [
				{
					id: "test-1",
					vector: [0.1, 0.2, 0.3, 0.4],
					payload: {
						filePath: "/test/file1.ts",
						content: "test content 1",
						// Missing startLine and endLine
					},
				},
			]

			mockLibSQLVector.upsert.mockResolvedValue(undefined)

			await vectorStore.upsertPoints(pointsWithMissingFields)

			expect(mockLibSQLVector.upsert).toHaveBeenCalledWith({
				indexName: testIndexName,
				vectors: [[0.1, 0.2, 0.3, 0.4]],
				ids: ["test-1"],
				metadata: [
					{
						filePath: "/test/file1.ts",
						content: "test content 1",
					},
				],
			})
		})
	})

	describe("search", () => {
		const testQueryVector = [0.1, 0.2, 0.3, 0.4]

		beforeEach(async () => {
			mockLibSQLVector.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should search with correct parameters", async () => {
			const mockResults = [
				{
					id: "test-1",
					score: 0.95,
					metadata: {
						filePath: "/test/file1.ts",
						content: "test content 1",
						startLine: 1,
						endLine: 10,
					},
				},
				{
					id: "test-2",
					score: 0.85,
					metadata: {
						filePath: "/test/file2.ts",
						content: "test content 2",
						startLine: 11,
						endLine: 20,
					},
				},
			]
			mockLibSQLVector.query.mockResolvedValue(mockResults)

			const results = await vectorStore.search(testQueryVector, undefined, 0.5, 10)

			expect(mockLibSQLVector.query).toHaveBeenCalledWith({
				indexName: testIndexName,
				queryVector: testQueryVector,
				topK: 10,
			})

			expect(results).toEqual([
				{
					id: "test-1",
					score: 0.95,
					payload: {
						filePath: "/test/file1.ts",
						content: "test content 1",
						startLine: 1,
						endLine: 10,
					},
				},
				{
					id: "test-2",
					score: 0.85,
					payload: {
						filePath: "/test/file2.ts",
						content: "test content 2",
						startLine: 11,
						endLine: 20,
					},
				},
			])
		})

		it("should filter results by minimum score", async () => {
			const mockResults = [
				{
					id: "test-1",
					score: 0.95,
					metadata: {
						filePath: "/test/file1.ts",
						codeChunk: "test content 1",
					},
				},
				{
					id: "test-2",
					score: 0.3, // Below threshold
					metadata: {
						filePath: "/test/file2.ts",
						content: "test content 2",
					},
				},
			]
			mockLibSQLVector.query.mockResolvedValue(mockResults)

			const results = await vectorStore.search(testQueryVector, undefined, 0.5, 10)

			expect(results).toHaveLength(1)
			expect(results[0].id).toBe("test-1")
		})

		it("should handle search errors", async () => {
			const error = new Error("Search failed")
			mockLibSQLVector.query.mockRejectedValue(error)

			await expect(vectorStore.search(testQueryVector, undefined, 0.5, 10)).rejects.toThrow(
				"Failed to search LibSQL vector store: Search failed",
			)
		})

		it("should handle empty search results", async () => {
			mockLibSQLVector.query.mockResolvedValue([])

			const results = await vectorStore.search(testQueryVector, undefined, 0.5, 10)

			expect(results).toEqual([])
		})

		it("should use default minimum score when not provided", async () => {
			const mockResults = [
				{
					id: "test-1",
					score: 0.95,
					metadata: {
						filePath: "/test/file1.ts",
						content: "test content 1",
					},
				},
			]
			mockLibSQLVector.query.mockResolvedValue(mockResults)

			const results = await vectorStore.search(testQueryVector, undefined, undefined, 10)

			expect(results).toHaveLength(1)
		})
	})

	describe("deletePointsByFilePath", () => {
		beforeEach(async () => {
			mockLibSQLVector.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should delete points by file path", async () => {
			mockLibSQLVector.deleteVector.mockResolvedValue(undefined)

			await vectorStore.deletePointsByFilePath("/test/file1.ts")

			expect(mockLibSQLVector.deleteVector).toHaveBeenCalledWith({
				indexName: testIndexName,
				where: "metadata->>'filePath' = '/test/file1.ts'",
			})
		})

		it("should handle deletion errors", async () => {
			const error = new Error("Delete failed")
			mockLibSQLVector.deleteVector.mockRejectedValue(error)

			await expect(vectorStore.deletePointsByFilePath("/test/file1.ts")).rejects.toThrow(
				"Failed to delete points by file path from LibSQL vector store: Delete failed",
			)
		})

		it("should handle file paths with special characters", async () => {
			mockLibSQLVector.deleteVector.mockResolvedValue(undefined)

			await vectorStore.deletePointsByFilePath("/test/file with spaces & symbols.ts")

			expect(mockLibSQLVector.deleteVector).toHaveBeenCalledWith({
				indexName: testIndexName,
				where: "metadata->>'filePath' = '/test/file with spaces & symbols.ts'",
			})
		})
	})

	describe("clearCollection", () => {
		beforeEach(async () => {
			mockLibSQLVector.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should clear collection", async () => {
			mockLibSQLVector.truncateIndex.mockResolvedValue(undefined)

			await vectorStore.clearCollection()

			expect(mockLibSQLVector.truncateIndex).toHaveBeenCalledWith({
				indexName: testIndexName,
			})
		})

		it("should handle clear errors", async () => {
			const error = new Error("Clear failed")
			mockLibSQLVector.truncateIndex.mockRejectedValue(error)

			await expect(vectorStore.clearCollection()).rejects.toThrow(
				"Failed to clear LibSQL vector store collection: Clear failed",
			)
		})
	})

	describe("deleteCollection", () => {
		beforeEach(async () => {
			mockLibSQLVector.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should delete collection and database file", async () => {
			const mockFs = require("fs")
			mockFs.existsSync.mockReturnValue(true)
			mockFs.rmSync.mockReturnValue(undefined)

			await vectorStore.deleteCollection()

			expect(mockFs.existsSync).toHaveBeenCalledWith(testDbPath)
			expect(mockFs.rmSync).toHaveBeenCalledWith(testDbPath, { force: true })
		})

		it("should handle case when database file does not exist", async () => {
			const mockFs = require("fs")
			mockFs.existsSync.mockReturnValue(false)

			await vectorStore.deleteCollection()

			expect(mockFs.existsSync).toHaveBeenCalledWith(testDbPath)
			expect(mockFs.rmSync).not.toHaveBeenCalled()
		})

		it("should handle deletion errors", async () => {
			const mockFs = require("fs")
			mockFs.existsSync.mockReturnValue(true)
			const error = new Error("File deletion failed")
			mockFs.rmSync.mockImplementation(() => {
				throw error
			})

			await expect(vectorStore.deleteCollection()).rejects.toThrow(
				"Failed to delete LibSQL vector store collection: File deletion failed",
			)
		})
	})

	describe("error handling", () => {
		it("should handle LibSQLVector constructor errors", () => {
			const { LibSQLVector } = require("@mastra/libsql")
			LibSQLVector.mockImplementation(() => {
				throw new Error("Constructor failed")
			})

			expect(() => {
				new LibSQLVectorStore(testDbPath, testIndexName, testDimension)
			}).toThrow("Constructor failed")
		})
	})
})
