import { beforeEach, describe, expect, it, vi } from "vitest";

type MockBuilder = Record<string, unknown>;

const {
  tableQueues,
  storageUploadMock,
  storageRemoveMock,
  logAuditMock,
} = vi.hoisted(() => ({
  tableQueues: new Map<string, MockBuilder[]>(),
  storageUploadMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

function createBuilder(config: {
  result?: Record<string, unknown>;
  maybeSingleResult?: Record<string, unknown>;
  singleResult?: Record<string, unknown>;
}) {
  const builder: MockBuilder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(() => Promise.resolve(config.result ?? { error: null })),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingleResult ?? config.result ?? { data: null, error: null })),
    single: vi.fn(() => Promise.resolve(config.singleResult ?? config.result ?? { data: null, error: null })),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(config.result ?? { data: null, error: null }).then(onFulfilled, onRejected),
  };

  return builder;
}

function queueTable(table: string, ...builders: MockBuilder[]) {
  tableQueues.set(table, [...builders]);
}

vi.mock("../../server/config/env", () => ({
  env: {
    NODE_ENV: "test",
    SUPABASE_DOCS_BUCKET: "documents",
  },
}));

vi.mock("../../server/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const queue = tableQueues.get(table);
      if (!queue || queue.length === 0) {
        throw new Error(`No queued builder for table ${table}`);
      }

      return queue.shift();
    }),
    storage: {
      from: vi.fn(() => ({
        upload: storageUploadMock,
        remove: storageRemoveMock,
      })),
    },
  },
}));

vi.mock("../../server/services/audit.service", () => ({
  logAudit: logAuditMock,
}));

describe("document.service", () => {
  beforeEach(() => {
    tableQueues.clear();
    vi.clearAllMocks();
    vi.resetModules();
    storageUploadMock.mockResolvedValue({ error: null });
    storageRemoveMock.mockResolvedValue({ error: null });
    logAuditMock.mockResolvedValue(undefined);
  });

  it("accepts jpeg uploads when the product config only lists another image format", async () => {
    const existingDocumentsBuilder = createBuilder({
      result: {
        data: [],
        error: null,
      },
    });
    const insertDocumentBuilder = createBuilder({
      singleResult: {
        data: {
          id: "doc-1",
          application_id: "app-1",
          user_id: "user-1",
          product_id: "prod-1",
          document_type: "bank_statement",
        },
        error: null,
      },
    });

    queueTable("loan_applications", createBuilder({
      maybeSingleResult: {
        data: {
          id: "app-1",
          user_id: "user-1",
          selected_product_id: "prod-1",
        },
        error: null,
      },
    }));
    queueTable("required_documents", createBuilder({
      result: {
        data: [
          {
            id: "req-1",
            document_type: "Bank Statement",
            accepted_formats: ["png"],
          },
        ],
        error: null,
      },
    }));
    queueTable("documents", existingDocumentsBuilder, insertDocumentBuilder);

    const { uploadDocumentForApplication } = await import("../../server/services/document.service");
    const result = await uploadDocumentForApplication({
      userId: "user-1",
      applicationId: "app-1",
      productId: "prod-1",
      documentType: "bank_statement",
      file: {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        originalname: "statement.jpeg",
        mimetype: "image/jpeg",
        size: 2048,
      } as Express.Multer.File,
      ipAddress: "127.0.0.1",
    });

    expect(storageUploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/app-1\//),
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "image/jpeg",
        upsert: false,
      }),
    );
    expect(insertDocumentBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      application_id: "app-1",
      user_id: "user-1",
      product_id: "prod-1",
      document_type: "bank_statement",
    }));
    expect(result).toEqual(expect.objectContaining({
      id: "doc-1",
      document_type: "bank_statement",
    }));
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "document.uploaded",
      entityId: "doc-1",
    }));
  });

  it("matches uploaded and available document keys canonically during completeness checks", async () => {
    queueTable("loan_applications", createBuilder({
      maybeSingleResult: {
        data: {
          id: "app-1",
          user_id: "user-1",
          selected_product_id: "prod-1",
        },
        error: null,
      },
    }));
    queueTable("documents", createBuilder({
      result: {
        data: [
          {
            id: "doc-1",
            document_type: "Bank Statement",
            product_id: "prod-1",
            status: "uploaded",
            validation_status: "unclear",
            created_at: "2026-03-09T00:00:00.000Z",
          },
        ],
        error: null,
      },
    }));
    queueTable("document_availability", createBuilder({
      result: {
        data: [
          {
            document_type: "BANK-STATEMENT",
            is_available: true,
          },
        ],
        error: null,
      },
    }));
    queueTable("loan_products", createBuilder({
      result: {
        data: [
          {
            id: "prod-1",
            name: "SME Booster",
            bank_id: "bank-1",
            banks: { name: "Bank A" },
          },
        ],
        error: null,
      },
    }));
    queueTable("required_documents", createBuilder({
      result: {
        data: [
          {
            id: "req-1",
            product_id: "prod-1",
            document_type: "bank_statement",
            display_name: "Bank Statement",
            is_required: true,
          },
        ],
        error: null,
      },
    }));
    queueTable("document_checks", createBuilder({
      result: { error: null },
    }));

    const { checkDocumentCompleteness } = await import("../../server/services/document.service");
    const result = await checkDocumentCompleteness("user-1", "app-1", ["prod-1"]);

    expect(result).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        overall_completeness: 100,
        total_required: 1,
        total_missing: 0,
      }),
    }));
    expect((result.by_scheme as Array<{ checklist: Array<Record<string, unknown>> }>)[0].checklist[0]).toEqual(expect.objectContaining({
      document_type: "bank_statement",
      available: true,
      uploaded: true,
      has_uploaded_record: true,
    }));
  });
});
