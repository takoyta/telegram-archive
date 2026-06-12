export const state = {
  chats: [],
  chatId: null,
  searchReturnChatId: null,
  offset: 0,
  limit: 50,
  hasMore: false,
  isLoadingMessages: false,
  searchTimer: null,
  chatsRefreshTimer: null,
  messagesRefreshTimer: null,
  eventsSource: null
};
