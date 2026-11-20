import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { apiClient } from "@/lib/api-client";

export interface WritingExample {
  id: string;
  label: string;
  content: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WritingContext {
  guide: string;
  updatedAt: string | null;
  examples: WritingExample[];
}

export interface WritingConversation {
  id: string;
  title: string;
  company: string;
  companyId: string | null;
  recipientName: string;
  recipientEmail: string;
  role: string;
  whyNow: string;
  contextLink: string;
  outputType: "cold-email" | "cover-letter" | "other";
  draftSubject: string;
  draftBody: string;
  draftUpdatedAt: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export const writingContextKey = ["writing-context"] as const;
export const writingConversationsKey = ["writing-conversations"] as const;

export function useWritingContext() {
  return useQuery({
    queryKey: writingContextKey,
    queryFn: () => apiClient<WritingContext>("/api/writing/context"),
  });
}

export function useWritingConversations() {
  return useQuery({
    queryKey: writingConversationsKey,
    queryFn: () =>
      apiClient<WritingConversation[]>("/api/writing/conversations"),
  });
}

export function useWritingMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["writing-messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const messages = await apiClient<UIMessage[]>(
        `/api/writing/conversations/${conversationId}/messages`,
      );
      return messages.map(({ id, role, parts }) => ({ id, role, parts }));
    },
  });
}
