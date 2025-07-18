// npx vitest services/code-index/vector-store/__tests__/libsql-vector-store.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { LibSQLVectorStore } from "../libsql-vector-store"
import { PointStruct } from "../../interfaces/vector-store"
import * as fs from "fs"
import * as path from "path"

// Mock @mastra/libsql
const mockLibSQLVectorInstanceInstanceInstance = {
	createIndex: vi.fn(),
	listIndexes: vi.fn(),
	upsert: vi.fn(),
	query: vi.fn(),
	deleteVector: vi.fn(),
	truncateIndex: vi.fn(),
	deleteIndex: vi.fn(),
}

vi.mock("@mastra/libsql", () => ({
	LibSQLVector: vi.fn().mockImplementation(() => mockLibSQLVectorInstanceInstanceInstance),
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
	let mockLibSQLVectorInstanceInstance: any
	const testDbPath = "/tmp/test-vector-store.db"
	const testIndexName = "test_index"
	const testDimension = 384

	beforeEach(async () => {
		vi.clearAllMocks()

		// Mock fs methods
		const fs = await import("fs")
		vi.mocked(fs.existsSync).mockReturnValue(true)
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined)

		// Mock path methods
		const path = await import("path")
		vi.mocked(path.dirname).mockReturnValue("/tmp")

		// Reset mock functions
		mockLibSQLVectorInstanceInstance.createIndex.mockReset()
		mockLibSQLVectorInstanceInstance.listIndexes.mockReset()
		mockLibSQLVectorInstanceInstance.upsert.mockReset()
		mockLibSQLVectorInstanceInstance.query.mockReset()
		mockLibSQLVectorInstanceInstance.deleteVector.mockReset()
		mockLibSQLVectorInstanceInstance.truncateIndex.mockReset()
		mockLibSQLVectorInstanceInstance.deleteIndex.mockReset()

		vectorStore = new LibSQLVectorStore("test-workspace", testDbPath, testDimension)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("constructor", () => {
		it("should initialize with correct parameters", () => {
			const { LibSQLVector } = require("@mastra/libsql")
			expect(LibSQLVector).toHaveBeenCalledWith({
				connectionUrl: `file:${testDbPath}`,
			})
		})

		it("should store configuration parameters", () => {
			expect(vectorStore).toBeDefined()
		})
	})

	describe("initialize", () => {
		it("should create index with correct parameters", async () => {
			mockLibSQLVectorInstanceInstance.listIndexes.mockResolvedValue([])
			mockLibSQLVectorInstanceInstance.createIndex.mockResolvedValue(undefined)

			const result = await vectorStore.initialize()

			expect(mockLibSQLVectorInstanceInstance.listIndexes).toHaveBeenCalled()
			expect(mockLibSQLVectorInstanceInstance.createIndex).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				dimension: testDimension,
			})
			expect(result).toBe(true)
		})

		it("should not create index if it already exists", async () => {
			mockLibSQLVectorInstanceInstance.listIndexes.mockResolvedValue([{ name: "ws_1234567890abcdef" }])

			const result = await vectorStore.initialize()

			expect(mockLibSQLVectorInstanceInstance.listIndexes).toHaveBeenCalled()
			expect(mockLibSQLVectorInstanceInstance.createIndex).not.toHaveBeenCalled()
			expect(result).toBe(false)
		})

		it("should handle initialization errors", async () => {
			const error = new Error("Failed to create index")
			mockLibSQLVectorInstanceInstance.listIndexes.mockRejectedValue(error)

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
			mockLibSQLVectorInstanceInstance.listIndexes.mockResolvedValue([])
			mockLibSQLVectorInstanceInstance.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should upsert points correctly", async () => {
			mockLibSQLVectorInstanceInstance.upsert.mockResolvedValue(undefined)

			await vectorStore.upsertPoints(testPoints)

			expect(mockLibSQLVectorInstanceInstance.upsert).toHaveBeenCalledWith({
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

			expect(mockLibSQLVectorInstanceInstance.upsert).not.toHaveBeenCalled()
		})

		it("should handle upsert errors", async () => {
			const error = new Error("Upsert failed")
			mockLibSQLVectorInstanceInstance.upsert.mockRejectedValue(error)

			await expect(vectorStore.upsertPoints(testPoints)).rejects.toThrow("Upsert failed")
		})

		it("should handle points with missing payload fields", async () => {
			const pointsWithMissingFields: PointStruct[] = [
				{
					id: "test-1",
					vector: [0.1, 0.2, 0.3, 0.4],
					payload: {
						filePath: "/test/file1.ts",
						codeChunk: "test content 1",
						// Missing startLine and endLine
					},
				},
			]

			mockLibSQLVectorInstanceInstance.upsert.mockResolvedValue(undefined)

			await vectorStore.upsertPoints(pointsWithMissingFields)

			expect(mockLibSQLVectorInstanceInstance.upsert).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				vectors: [[0.1, 0.2, 0.3, 0.4]],
				ids: ["test-1"],
				metadata: [
					{
						filePath: "/test/file1.ts",
						codeChunk: "test content 1",
						startLine: 0,
						endLine: 0,
						pathSegments: ["test", "file1.ts"],
					},
				],
			})
		})
	})

	describe("search", () => {
		const testQueryVector = [0.1, 0.2, 0.3, 0.4]

		beforeEach(async () => {
			mockLibSQLVectorInstanceInstance.createIndex.mockResolvedValue(undefined)
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
			mockLibSQLVectorInstanceInstance.query.mockResolvedValue(mockResults)

			const results = await vectorStore.search(testQueryVector, undefined, 0.5, 10)

			expect(mockLibSQLVectorInstanceInstance.query).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				queryVector: testQueryVector,
				topK: 10,
				filter: undefined,
				includeVector: false,
				minScore: 0.5,
			})

			expect(results).toEqual([
				{
					id: "test-1",
					score: 0.95,
					payload: {
						filePath: "/test/file1.ts",
						codeChunk: "test content 1",
						startLine: 1,
						endLine: 10,
					},
				},
				{
					id: "test-2",
					score: 0.85,
					payload: {
						filePath: "/test/file2.ts",
						codeChunk: "test content 2",
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
			mockLibSQLVectorInstanceInstance.query.mockResolvedValue(mockResults)

			const results = await vectorStore.search(testQueryVector, undefined, 0.5, 10)

			expect(results).toHaveLength(1)
			expect(results[0].id).toBe("test-1")
		})

		it("should handle search errors", async () => {
			const error = new Error("Search failed")
			mockLibSQLVectorInstanceInstance.query.mockRejectedValue(error)

			await expect(vectorStore.search(testQueryVector, undefined, 0.5, 10)).rejects.toThrow(
				"Failed to search LibSQL vector store: Search failed",
			)
		})

		it("should handle empty search results", async () => {
			mockLibSQLVectorInstanceInstance.query.mockResolvedValue([])

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
			mockLibSQLVectorInstanceInstance.query.mockResolvedValue(mockResults)

			const results = await vectorStore.search(testQueryVector, undefined, undefined, 10)

			expect(results).toHaveLength(1)
		})
	})

	describe("deletePointsByFilePath", () => {
		beforeEach(async () => {
			mockLibSQLVectorInstanceInstance.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should delete points by file path", async () => {
			mockLibSQLVectorInstanceInstance.query.mockResolvedValue([{ id: "test-1" }, { id: "test-2" }])
			mockLibSQLVectorInstanceInstance.deleteVector.mockResolvedValue(undefined)

			await vectorStore.deletePointsByFilePath("/test/file1.ts")

			expect(mockLibSQLVectorInstanceInstance.query).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				queryVector: expect.any(Array),
				topK: 10000,
				filter: {
					filePath: { $eq: "/test/file1.ts" },
				},
				includeVector: false,
			})
			expect(mockLibSQLVectorInstanceInstance.deleteVector).toHaveBeenCalledTimes(2)
		})

		it("should handle deletion errors", async () => {
			const error = new Error("Delete failed")
			mockLibSQLVectorInstanceInstance.query.mockRejectedValue(error)

			await expect(vectorStore.deletePointsByFilePath("/test/file1.ts")).rejects.toThrow("Delete failed")
		})

		it("should handle file paths with special characters", async () => {
			mockLibSQLVectorInstanceInstance.query.mockResolvedValue([{ id: "test-1" }])
			mockLibSQLVectorInstanceInstance.deleteVector.mockResolvedValue(undefined)

			await vectorStore.deletePointsByFilePath("/test/file with spaces & symbols.ts")

			expect(mockLibSQLVectorInstanceInstance.query).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
				queryVector: expect.any(Array),
				topK: 10000,
				filter: {
					filePath: { $eq: "/test/file with spaces & symbols.ts" },
				},
				includeVector: false,
			})
		})
	})

	describe("clearCollection", () => {
		beforeEach(async () => {
			mockLibSQLVectorInstanceInstance.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should clear collection", async () => {
			mockLibSQLVectorInstanceInstance.truncateIndex.mockResolvedValue(undefined)

			await vectorStore.clearCollection()

			expect(mockLibSQLVectorInstanceInstance.truncateIndex).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
			})
		})

		it("should handle clear errors", async () => {
			const error = new Error("Clear failed")
			mockLibSQLVectorInstanceInstance.truncateIndex.mockRejectedValue(error)

			await expect(vectorStore.clearCollection()).rejects.toThrow("Clear failed")
		})
	})

	describe("deleteCollection", () => {
		beforeEach(async () => {
			mockLibSQLVectorInstanceInstance.createIndex.mockResolvedValue(undefined)
			await vectorStore.initialize()
		})

		it("should delete collection", async () => {
			mockLibSQLVectorInstanceInstance.listIndexes.mockResolvedValue([{ name: "ws_1234567890abcdef" }])
			mockLibSQLVectorInstanceInstance.deleteIndex.mockResolvedValue(undefined)

			await vectorStore.deleteCollection()

			expect(mockLibSQLVectorInstanceInstance.deleteIndex).toHaveBeenCalledWith({
				indexName: expect.stringMatching(/^ws_[a-f0-9]{16}$/),
			})
		})

		it("should handle case when collection does not exist", async () => {
			mockLibSQLVectorInstanceInstance.listIndexes.mockResolvedValue([])

			await vectorStore.deleteCollection()

			expect(mockLibSQLVectorInstanceInstance.deleteIndex).not.toHaveBeenCalled()
		})

		it("should handle deletion errors", async () => {
			const error = new Error("Delete index failed")
			mockLibSQLVectorInstanceInstance.listIndexes.mockRejectedValue(error)

			await expect(vectorStore.deleteCollection()).rejects.toThrow("Delete index failed")
		})
	})

	describe("error handling", () => {
		it("should handle LibSQLVector constructor errors", () => {
			const { LibSQLVector } = require("@mastra/libsql")
			LibSQLVector.mockImplementation(() => {
				throw new Error("Constructor failed")
			})

			expect(() => {
				new LibSQLVectorStore("test-workspace", testDbPath, testDimension)
			}).toThrow("Constructor failed")
		})
	})
})
