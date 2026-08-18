import type {
	ImageContent,
	Message,
	MessageAttribution,
	ProviderPayload,
	TextContent,
	ToolResultMessage,
} from "@oh-my-pi/pi-ai";
import { prompt } from "@oh-my-pi/pi-utils";
import type { AgentMessage } from "../types";
import branchSummaryContextPrompt from "./prompts/branch-summary-context.md" with { type: "text" };
import compactionSummaryContextPrompt from "./prompts/compaction-summary-context.md" with { type: "text" };
import harnessNoticePrompt from "./prompts/harness-notice.md" with { type: "text" };

const COMPACTION_SUMMARY_TEMPLATE = compactionSummaryContextPrompt;
const BRANCH_SUMMARY_TEMPLATE = branchSummaryContextPrompt;
const HARNESS_NOTICE_TEMPLATE = harnessNoticePrompt;

export interface CustomMessage<T = unknown> {
	role: "custom";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display: boolean;
	details?: T;
	/** Who initiated this message for billing/attribution semantics. */
	attribution?: MessageAttribution;
	timestamp: number;
}

/** Legacy hook message type (pre-extensions). Kept for session migration. */
export interface HookMessage<T = unknown> {
	role: "hookMessage";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display: boolean;
	details?: T;
	/** Who initiated this message for billing/attribution semantics. */
	attribution?: MessageAttribution;
	timestamp: number;
}

export interface BranchSummaryMessage {
	role: "branchSummary";
	summary: string;
	fromId: string;
	timestamp: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	shortSummary?: string;
	tokensBefore: number;
	providerPayload?: ProviderPayload;
	/** Runtime-only ordered archive blocks for snapcompact: old text region,
	 *  imaged middle, then new text region. When present, `summary` is already
	 *  the final lead-in text (no legacy wrapper applied). */
	blocks?: (TextContent | ImageContent)[];
	/** Snapcompact image blocks, kept for display counts / legacy consumers. */
	images?: ImageContent[];
	/** Post-pass dead-end warning attached to this compaction (progress guard). */
	warning?: string;
	timestamp: number;
}

export type CoreCompactionMessage = CustomMessage | HookMessage | BranchSummaryMessage | CompactionSummaryMessage;

declare module "../types" {
	interface CustomAgentMessages {
		custom: CustomMessage;
		hookMessage: HookMessage;
		branchSummary: BranchSummaryMessage;
		compactionSummary: CompactionSummaryMessage;
	}
}
export type ConvertToLlm = (messages: AgentMessage[]) => Message[];

function getPrunedToolResultContent(message: ToolResultMessage): (TextContent | ImageContent)[] {
	if (message.prunedAt === undefined) {
		return message.content;
	}
	const textBlocks = message.content.filter((content): content is TextContent => content.type === "text");
	const text = textBlocks.map(block => block.text).join("") || "[Output truncated]";
	return [{ type: "text", text }];
}

export function renderBranchSummaryContext(summary: string): string {
	return prompt.render(BRANCH_SUMMARY_TEMPLATE, { summary });
}

export function renderCompactionSummaryContext(summary: string): string {
	return prompt.render(COMPACTION_SUMMARY_TEMPLATE, { summary });
}

export function createBranchSummaryMessage(summary: string, fromId: string, timestamp: string): BranchSummaryMessage {
	return {
		role: "branchSummary",
		summary,
		fromId,
		timestamp: new Date(timestamp).getTime(),
	};
}

export function createCompactionSummaryMessage(
	summary: string,
	tokensBefore: number,
	timestamp: string,
	shortSummary?: string,
	providerPayload?: ProviderPayload,
	images?: ImageContent[],
	blocks?: (TextContent | ImageContent)[],
	warning?: string,
): CompactionSummaryMessage {
	const imageBlocks =
		blocks?.filter((block): block is ImageContent => block.type === "image") ??
		(images && images.length > 0 ? images : undefined);
	return {
		role: "compactionSummary",
		summary,
		shortSummary,
		tokensBefore,
		providerPayload,
		blocks: blocks && blocks.length > 0 ? blocks : undefined,
		images: imageBlocks && imageBlocks.length > 0 ? imageBlocks : undefined,
		warning,
		timestamp: new Date(timestamp).getTime(),
	};
}

export function createCustomMessage(
	customType: string,
	content: string | (TextContent | ImageContent)[],
	display: boolean,
	details: unknown | undefined,
	timestamp: string,
	attribution?: MessageAttribution,
): CustomMessage {
	return {
		role: "custom",
		customType,
		content,
		display,
		details,
		attribution,
		timestamp: new Date(timestamp).getTime(),
	};
}

function isCoreCompactionMessage(message: AgentMessage): message is AgentMessage & CoreCompactionMessage {
	return (
		message.role === "custom" ||
		message.role === "hookMessage" ||
		message.role === "branchSummary" ||
		message.role === "compactionSummary"
	);
}

/**
 * LOCAL BUILD: mark harness-originated custom/hook messages as not-user.
 *
 * These convert to `role: "developer"`, and the Anthropic wire builder pushes
 * developer turns as `{role: "user"}` (`anthropic.ts`). It promotes them back to
 * a mid-conversation `system` param, but only when the model is on the official
 * `api.anthropic.com` host AND the turn follows a user message AND is last or
 * immediately before an assistant. Two consequences upstream missed:
 *
 * - Any gateway (ours included) fails the host check, so no developer message is
 *   ever promoted and every one arrives as unmarked user input.
 * - A supervised-process exit notification lands after an *assistant* turn by
 *   definition, so it fails `followsUser` and is unpromotable even first-party.
 *
 * `attribution` already distinguishes the two cases and rides all the way here,
 * then goes unread by every provider. Messages the user really did author
 * (`collab-prompt`, user-invoked skill prompts) set `attribution: "user"` and are
 * intercepted before this path; undefined means machine-originated, matching
 * `normalizeCustomMessageAttribution`.
 *
 * The envelope must stay a pure function of the message — never its position —
 * or a cached prefix gets rewritten and the provider prompt cache busts from
 * that message onward. See `wrapSteeringForModel`, which learned this the hard
 * way.
 */
function wrapHarnessNotice(
	customType: string,
	content: string | (TextContent | ImageContent)[],
): (TextContent | ImageContent)[] {
	const blocks = typeof content === "string" ? [{ type: "text" as const, text: content }] : content;
	const text = blocks
		.filter((block): block is TextContent => block.type === "text")
		.map(block => block.text)
		.join("\n");
	// An empty notice would be pure overhead, and a text-free image payload keeps
	// whatever framing its own converter gave it.
	if (text.trim().length === 0) return blocks;
	return [
		{ type: "text" as const, text: prompt.render(HARNESS_NOTICE_TEMPLATE, { customType, message: text }) },
		...blocks.filter((block): block is ImageContent => block.type === "image"),
	];
}

/**
 * Transform a single core-domain agent message to its LLM form; `undefined`
 * drops it from the provider request.
 *
 * Single source of truth for the core roles (user/developer/assistant/
 * toolResult) and the compaction messages owned by this package. Embedders
 * with their own app messages (e.g. the coding agent) handle their custom
 * roles and delegate every core role here — duplicating these cases is how
 * snapcompact frames once silently fell off the provider request.
 */
export function convertMessageToLlm(message: AgentMessage): Message | undefined {
	if (isCoreCompactionMessage(message)) {
		switch (message.role) {
			case "custom":
			case "hookMessage": {
				const content =
					message.attribution === "user"
						? typeof message.content === "string"
							? [{ type: "text" as const, text: message.content }]
							: message.content
						: wrapHarnessNotice(message.customType, message.content);
				return {
					role: "developer",
					content,
					attribution: message.attribution,
					timestamp: message.timestamp,
				};
			}
			case "branchSummary":
				return {
					role: "user",
					content: [
						{
							type: "text" as const,
							text: renderBranchSummaryContext(message.summary),
						},
					],
					attribution: "agent",
					timestamp: message.timestamp,
				};
			case "compactionSummary":
				return {
					role: "user",
					content:
						message.blocks !== undefined
							? [{ type: "text" as const, text: message.summary }, ...message.blocks]
							: [
									{
										type: "text" as const,
										text: renderCompactionSummaryContext(message.summary),
									},
									...(message.images ?? []),
								],
					attribution: "agent",
					providerPayload: message.providerPayload,
					timestamp: message.timestamp,
				};
		}
	}

	switch (message.role) {
		case "user":
			return { ...message, attribution: message.attribution ?? "user" };
		case "developer":
			return { ...message, attribution: message.attribution ?? "agent" };
		case "assistant":
			return message;
		case "toolResult":
			return {
				...message,
				content: getPrunedToolResultContent(message as ToolResultMessage),
				attribution: message.attribution ?? "agent",
			};
		default:
			return undefined;
	}
}

/**
 * Default compaction-domain transformer.
 *
 * Embedders with their own app messages should pass a richer transformer through
 * `SummaryOptions.convertToLlm`; this default intentionally preserves only the
 * core LLM roles and the compaction messages owned by this package.
 */
export function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
	return messages.map(convertMessageToLlm).filter(message => message !== undefined);
}
