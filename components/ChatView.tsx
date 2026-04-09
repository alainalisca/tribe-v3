'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  deleted?: boolean;
  user: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

interface ChatViewProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (message: string) => Promise<boolean>;
  loading: boolean;
  header?: React.ReactNode;
}

export default function ChatView({ messages, currentUserId, onSend, loading, header }: ChatViewProps) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function formatTime(timestamp: string) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      setSending(true);
      const success = await onSend(newMessage.trim());
      if (success) {
        setNewMessage('');
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100dvh-6rem)] bg-stone-50 dark:bg-[#3D4349]">
        {header && (
          <div className="bg-stone-100 dark:bg-[#52575D] px-4 py-3 border-b border-stone-300 dark:border-[#52575D] flex-shrink-0">
            {header}
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-stone-600 dark:text-gray-300">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-6rem)] bg-stone-50 dark:bg-[#3D4349]">
      {/* Chat Header */}
      {header && (
        <div className="bg-stone-100 dark:bg-[#52575D] px-4 py-3 border-b border-stone-300 dark:border-[#52575D] flex-shrink-0">
          {header}
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">No messages yet</h3>
            <p className="text-stone-500 dark:text-gray-400 text-sm">Start a conversation</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.user_id === currentUserId;

            if (msg.deleted) {
              return (
                <div key={msg.id} className="flex gap-2">
                  <div className="flex-1 p-3 bg-stone-100 dark:bg-[#52575D] rounded-lg opacity-50">
                    <p className="text-xs text-stone-500 italic">Message deleted</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                <Link href={`/profile/${msg.user.id}`} className="flex-shrink-0">
                  <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80">
                    <AvatarImage src={msg.user?.avatar_url || undefined} alt={msg.user?.name || ''} />
                    <AvatarFallback className="bg-[#A3E635] text-[#272D34] text-xs font-semibold">
                      {getInitials(msg.user?.name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-medium text-stone-700 dark:text-gray-300">
                      {isOwnMessage ? 'You' : msg.user?.name}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-gray-400">{formatTime(msg.created_at)}</span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      isOwnMessage ? 'bg-[#A3E635] text-[#272D34]' : 'bg-stone-200 dark:bg-[#52575D] text-stone-900 dark:text-white'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 bg-stone-50 dark:bg-[#52575D] border-t border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            autoComplete="off"
            enterKeyHint="send"
            className="flex-1 px-4 py-2 bg-white dark:bg-[#404549] dark:border-[#52575D] rounded-full text-stone-900 dark:text-white placeholder-gray-500 focus:ring-[#A3E635] disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={!newMessage.trim() || sending}
            size="icon"
            className="p-2 bg-[#A3E635] text-[#272D34] rounded-full hover:opacity-90 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
