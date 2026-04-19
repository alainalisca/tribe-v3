'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';
import {
  fetchSessionComments,
  insertSessionComment,
  deleteSessionComment,
  SessionCommentWithAuthor,
} from '@/lib/dal/sessionComments';
import { MessageCircle, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { formatTimeAgo } from '@/app/feed/page';

interface SessionQAProps {
  sessionId: string;
  currentUserId: string | null;
  isCreator: boolean;
  creatorId: string;
  language: string;
}

export default function SessionQA({ sessionId, currentUserId, isCreator, creatorId, language }: SessionQAProps) {
  const supabase = createClient();
  const [comments, setComments] = useState<SessionCommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEs = language === 'es';

  useEffect(() => {
    if (!expanded) return;

    const loadComments = async () => {
      setLoading(true);
      try {
        const result = await fetchSessionComments(supabase, sessionId);
        if (result.success && result.data) {
          setComments(result.data);
        }
      } catch (error) {
        logError(error, { action: 'loadSessionComments', sessionId });
      } finally {
        setLoading(false);
      }
    };

    loadComments();
  }, [expanded, sessionId, supabase]);

  const handleAdd = async () => {
    if (!newComment.trim() || submitting || !currentUserId) return;

    setSubmitting(true);
    try {
      const result = await insertSessionComment(supabase, sessionId, currentUserId, newComment.trim());

      if (result.success && result.data) {
        setComments((prev) => [...prev, result.data!]);
        setNewComment('');
      }
    } catch (error) {
      logError(error, { action: 'addSessionComment', sessionId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const result = await deleteSessionComment(supabase, commentId);
      if (result.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (error) {
      logError(error, { action: 'deleteSessionComment', sessionId });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="bg-white dark:bg-tribe-card rounded-2xl border border-stone-200 dark:border-gray-700 overflow-hidden">
      {/* Header / Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 dark:hover:bg-tribe-surface transition"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-tribe-green" />
          <span className="font-semibold text-theme-primary text-sm">
            {isEs ? 'Preguntas y Respuestas' : 'Questions & Answers'}
          </span>
          {comments.length > 0 && (
            <span className="bg-tribe-green/20 text-tribe-green text-xs font-bold px-2 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-theme-secondary" />
        ) : (
          <ChevronDown className="h-4 w-4 text-theme-secondary" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-200 dark:border-gray-700">
          {/* Comments list */}
          <div className="space-y-3 mt-3 max-h-96 overflow-y-auto">
            {loading && comments.length === 0 ? (
              <p className="text-sm text-theme-secondary">{isEs ? 'Cargando...' : 'Loading...'}</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-theme-secondary italic py-2">
                {isEs
                  ? 'No hay preguntas aun. \u00a1Se el primero en preguntar!'
                  : 'No questions yet. Be the first to ask!'}
              </p>
            ) : (
              comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  isCreator={isCreator}
                  sessionCreatorId={creatorId}
                  language={language}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>

          {/* Add comment input */}
          {currentUserId ? (
            <div className="flex gap-2 items-end mt-4">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={500}
                placeholder={isEs ? 'Escribe tu pregunta...' : 'Ask a question...'}
                className="flex-1 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-theme-primary placeholder-theme-secondary resize-none max-h-20"
                rows={2}
              />
              <button
                onClick={handleAdd}
                disabled={!newComment.trim() || submitting}
                className="flex items-center gap-2 bg-tribe-green text-slate-900 rounded-lg px-4 py-2 font-semibold hover:bg-tribe-green disabled:opacity-50 transition"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-theme-secondary italic mt-4">
              {isEs ? 'Inicia sesion para hacer una pregunta.' : 'Sign in to ask a question.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface CommentItemProps {
  comment: SessionCommentWithAuthor;
  currentUserId: string | null;
  isCreator: boolean;
  sessionCreatorId: string | null;
  language: string;
  onDelete: (commentId: string) => void;
}

function CommentItem({ comment, currentUserId, isCreator, sessionCreatorId, language, onDelete }: CommentItemProps) {
  const isEs = language === 'es';
  const isOwnComment = currentUserId === comment.author_id;
  const canDelete = isOwnComment || isCreator;
  const isHostComment = comment.author_id === sessionCreatorId;

  return (
    <div className="flex gap-2">
      {comment.author?.avatar_url ? (
        <Image
          src={comment.author.avatar_url}
          alt={comment.author.name}
          width={32}
          height={32}
          className="h-8 w-8 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-stone-200 dark:bg-stone-600 flex-shrink-0 flex items-center justify-center">
          <span className="text-xs font-bold text-theme-secondary">
            {(comment.author?.name || '?')[0].toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="bg-stone-100 dark:bg-tribe-surface rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-theme-primary">
              {comment.author?.name || (isEs ? 'Usuario' : 'User')}
            </p>
            {isHostComment && (
              <span className="text-[10px] font-bold bg-tribe-green/20 text-tribe-green px-1.5 py-0.5 rounded">
                {isEs ? 'Anfitrion' : 'Host'}
              </span>
            )}
          </div>
          <p className="text-sm text-theme-primary whitespace-pre-wrap break-words">{comment.content}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-theme-secondary">{formatTimeAgo(comment.created_at, language)}</p>
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-xs text-theme-secondary hover:text-red-500 transition flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              {isEs ? 'Eliminar' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
