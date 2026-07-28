import { normalizeMessage } from "./normalizeMessage";

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

  // HTML transformations
  {
    label: "html_paragraph_breaks",
    rawMessage: "<p>Hello</p><p>We should fix this</p>",
    expectPersist: true,
    expectNormalizedContains: ["hello", "we should fix this"],
    expectNormalizedExcludes: ["<p>"],
  },
  {
    label: "html_mention_page",
    rawMessage:
      '<p><span class="mention-page" data-id="abc" data-label="Workspace">Workspace</span></p>',
    expectPersist: true,
    expectNormalizedContains: ["[[PAGE: Workspace]]"],
    expectNormalizedExcludes: ["<span", "mention-page"],
  },
  {
    label: "html_mention_user",
    rawMessage: '<span class="mention-user" data-id="u1">Carlos</span>',
    expectPersist: true,
    expectNormalizedContains: ["[[USER: Carlos]]"],
    expectNormalizedExcludes: ["<span"],
  },
  {
    label: "html_msg_quote_removed",
    rawMessage:
      '<p>Hello</p><div class="msg-quote" data-author="Bob">quoted text</div><p>After</p>',
    expectPersist: true,
    expectNormalizedContains: ["hello", "after"],
    expectNormalizedExcludes: ["quoted text", "msg-quote"],
  },
  {
    label: "html_blockquote_removed",
    rawMessage: "<p>Before</p><blockquote>quoted</blockquote><p>After</p>",
    expectPersist: true,
    expectNormalizedContains: ["before", "after"],
    expectNormalizedExcludes: ["quoted", "blockquote"],
  },
  {
    label: "html_anchor_href",
    rawMessage: '<a href="https://example.com/docs" class="link">click here</a>',
    expectPersist: true,
    expectNormalizedContains: ["https://example.com/docs"],
    expectNormalizedExcludes: ["click here", "<a"],
  },
  {
    label: "html_anchor_entity_href",
    rawMessage: '<a href="https://example.com/caf&#233;">link</a>',
    expectPersist: true,
    expectNormalizedContains: ["https://example.com/café"],
  },
  {
    label: "html_image_no_alt",
    rawMessage: '<p>Look at this <img src="/pic.png" /></p>',
    expectPersist: true,
    expectNormalizedContains: ["[[IMAGE]]", "look at this"],
    expectNormalizedExcludes: ["<img"],
  },
  {
    label: "html_image_with_alt",
    rawMessage: '<img src="/pic.png" alt="Screenshot" />',
    expectPersist: true,
    expectNormalizedContains: ["[[IMAGE: Screenshot]]"],
  },
  {
    label: "html_list_items",
    rawMessage: "<ul><li>first</li><li>second</li><li>third</li></ul>",
    expectPersist: true,
    expectNormalizedContains: ["- first", "- second", "- third"],
    expectNormalizedExcludes: ["<ul", "<li"],
  },
  {
    label: "html_table",
    rawMessage: "<table><tr><td>Cell A</td><td>Cell B</td></tr></table>",
    expectPersist: true,
    expectNormalizedContains: ["cell a", "cell b"],
    expectNormalizedExcludes: ["<table", "<td"],
  },
  {
    label: "html_generic_span",
    rawMessage: '<p>Hello <span class="highlight">world</span></p>',
    expectPersist: true,
    expectNormalizedContains: ["hello world"],
    expectNormalizedExcludes: ["<span"],
  },
  {
    label: "html_inline_code",
    rawMessage: "<p>Use the <code>fetchData()</code> helper</p>",
    expectPersist: true,
    expectNormalizedContains: ["[[CODE]]fetchData()[[/CODE]]"],
    expectNormalizedExcludes: ["<code"],
  },
  {
    label: "html_code_block",
    rawMessage: "<pre><code>const x = 1;\nconsole.log(x);</code></pre>",
    expectPersist: true,
    expectNormalizedContains: ["[[CODE_BLOCK]]", "const x = 1;", "[[/CODE_BLOCK]]"],
    expectNormalizedExcludes: ["<pre", "<code"],
  },
  {
    label: "html_emoji_only_skip",
    rawMessage: "<p>😀🎉👍</p>",
    expectPersist: false,
    expectSkipReason: "emoji_only",
  },
  {
    label: "html_no_tags_in_output",
    rawMessage: "<p><strong>lorem</strong> ipsum</p>",
    expectPersist: true,
    expectNormalizedContains: ["lorem ipsum"],
    expectNormalizedExcludes: ["<p>", "<strong>", "<em>"],
  },
];

function assertCase(example: ExampleCase): void {
  const result = normalizeMessage(example.rawMessage, example.messageType);

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
