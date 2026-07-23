import { processMessageNormalization } from "./normalizer";

type ExampleCase = {
  label: string;
  rawMessage: string;
  messageType?: string;
  expectPersist: boolean;
  expectSkipReason?: string;
  expectNormalizedContains?: string[];
  expectNormalizedExcludes?: string[];
};

const cases: ExampleCase[] = [
  // Early pre-filters
  {
    label: "emoji_only",
    rawMessage: "😀🎉👍",
    expectPersist: false,
    expectSkipReason: "emoji_only",
  },
  {
    label: "punctuation_only",
    rawMessage: "!!!???...",
    expectPersist: false,
    expectSkipReason: "punctuation_only",
  },
  {
    label: "non_text",
    rawMessage: "",
    messageType: "image",
    expectPersist: false,
    expectSkipReason: "non_text",
  },

  // Shortcut expansion
  {
    label: "shortcut_u",
    rawMessage: "can u help",
    expectPersist: true,
    expectNormalizedContains: ["you"],
  },
  {
    label: "shortcut_pls",
    rawMessage: "pls review this",
    expectPersist: true,
    expectNormalizedContains: ["please"],
  },
  {
    label: "shortcut_idk",
    rawMessage: "idk what to do",
    expectPersist: true,
    expectNormalizedContains: ["i do not know"],
  },

  // PII patterns
  {
    label: "pii_email",
    rawMessage: "contact me at alice@example.com",
    expectPersist: true,
    expectNormalizedContains: ["[EMAIL]"],
    expectNormalizedExcludes: ["alice@example.com"],
  },
  {
    label: "pii_phone",
    rawMessage: "call me at +1 (555) 123-4567",
    expectPersist: true,
    expectNormalizedContains: ["[PHONE]"],
    expectNormalizedExcludes: ["555"],
  },
  {
    label: "pii_url",
    rawMessage: "see https://app.example.com/data?token=abc123",
    expectPersist: true,
    expectNormalizedContains: ["[URL]"],
    expectNormalizedExcludes: ["token=abc123"],
  },
  {
    label: "pii_token",
    rawMessage: "Authorization: Bearer sk_live_abcdefghijklmnopqrstuv",
    expectPersist: true,
    expectNormalizedContains: ["[TOKEN]"],
    expectNormalizedExcludes: ["sk_live"],
  },
  {
    label: "pii_jwt",
    rawMessage:
      "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    expectPersist: true,
    expectNormalizedContains: ["[JWT]"],
    expectNormalizedExcludes: ["eyJhbGci"],
  },
  {
    label: "pii_iban",
    rawMessage: "transfer to GB82WEST12345698765432",
    expectPersist: true,
    expectNormalizedContains: ["[IBAN]"],
    expectNormalizedExcludes: ["GB82WEST"],
  },
  {
    label: "pii_password",
    rawMessage: "my password: secret123!",
    expectPersist: true,
    expectNormalizedContains: ["[PASSWORD]"],
    expectNormalizedExcludes: ["secret123"],
  },
  {
    label: "pii_multiple",
    rawMessage: "email bob@test.com phone 555-0100 pwd=abc123 url https://x.com?key=1",
    expectPersist: true,
    expectNormalizedContains: ["[EMAIL]", "[PHONE]", "[PASSWORD]", "[URL]"],
    expectNormalizedExcludes: ["bob@test.com", "abc123", "key=1"],
  },

  // Acknowledgement filter
  {
    label: "ack_lol",
    rawMessage: "lol",
    expectPersist: false,
    expectSkipReason: "low_value_ack",
  },
  {
    label: "ack_ok",
    rawMessage: "ok",
    expectPersist: false,
    expectSkipReason: "low_value_ack",
    expectNormalizedContains: ["okay"],
  },
  {
    label: "ack_thanks",
    rawMessage: "thanks",
    expectPersist: false,
    expectSkipReason: "low_value_ack",
  },
  {
    label: "ack_yes",
    rawMessage: "yes",
    expectPersist: false,
    expectSkipReason: "low_value_ack",
  },
  {
    label: "ack_k",
    rawMessage: "k",
    expectPersist: false,
    expectSkipReason: "low_value_ack",
  },
  {
    label: "ack_kk_shortcut",
    rawMessage: "kk",
    expectPersist: false,
    expectSkipReason: "low_value_ack",
    expectNormalizedContains: ["okay"],
  },
  {
    label: "ack_multi_persist_yes",
    rawMessage: "yes we should do it",
    expectPersist: true,
    expectNormalizedContains: ["yes we should do it"],
  },
  {
    label: "ack_multi_persist_thanks",
    rawMessage: "thanks for the help",
    expectPersist: true,
    expectNormalizedContains: ["thanks for the help"],
  },
  {
    label: "ack_non_ack_maybe",
    rawMessage: "maybe",
    expectPersist: true,
    expectNormalizedContains: ["maybe"],
  },
  {
    label: "ack_non_ack_agree",
    rawMessage: "agree",
    expectPersist: true,
    expectNormalizedContains: ["agree"],
  },
  {
    label: "ack_non_ack_reject",
    rawMessage: "reject",
    expectPersist: true,
    expectNormalizedContains: ["reject"],
  },
];

function assertCase(example: ExampleCase): void {
  const result = processMessageNormalization(example.rawMessage, {
    messageType: example.messageType,
    messageId: example.label,
  });

  if (result.shouldPersist !== example.expectPersist) {
    throw new Error(
      `[${example.label}] expected shouldPersist=${example.expectPersist}, got ${result.shouldPersist}`,
    );
  }

  if (example.expectSkipReason && result.skipReason !== example.expectSkipReason) {
    throw new Error(
      `[${example.label}] expected skipReason=${example.expectSkipReason}, got ${result.skipReason}`,
    );
  }

  const normalized = result.normalizedText ?? "";

  for (const fragment of example.expectNormalizedContains ?? []) {
    if (!normalized.includes(fragment)) {
      throw new Error(
        `[${example.label}] expected normalizedText to contain "${fragment}", got "${normalized}"`,
      );
    }
  }

  for (const fragment of example.expectNormalizedExcludes ?? []) {
    if (normalized.includes(fragment)) {
      throw new Error(
        `[${example.label}] expected normalizedText to exclude "${fragment}", got "${normalized}"`,
      );
    }
  }
}

export function runNormalizationExamples(): void {
  console.log("Running message normalization examples...\n");

  for (const example of cases) {
    assertCase(example);
    console.log(`✓ ${example.label}`);
  }

  console.log(`\nAll ${cases.length} examples passed.`);
}

const isDirectRun = typeof process !== "undefined" && process.argv[1]?.includes("runExamples");

if (isDirectRun) {
  runNormalizationExamples();
}
