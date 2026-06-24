// Stub chat storage — uses local types rather than importing non-existent
// schema tables. The conversations/messages tables have not yet been added to
// @shared/schema; this file is not wired into the live application.
// When the schema tables are provisioned, replace these stubs with real DB
// queries and import the types from @shared/schema.

export interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

function notImplemented(method: string): never {
  throw new Error(`chatStorage.${method}: conversations/messages schema tables are not yet provisioned`);
}

export const chatStorage: IChatStorage = {
  getConversation: (_id) => notImplemented("getConversation"),
  getAllConversations: () => notImplemented("getAllConversations"),
  createConversation: (_title) => notImplemented("createConversation"),
  deleteConversation: (_id) => notImplemented("deleteConversation"),
  getMessagesByConversation: (_id) => notImplemented("getMessagesByConversation"),
  createMessage: (_cid, _role, _content) => notImplemented("createMessage"),
};
