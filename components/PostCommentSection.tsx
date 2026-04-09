'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchPostComments, insertPostComment, deletePostComment, PostCommentWithAuthor } from '@/lib/dal/comments'
import { Trash2, Send } from 'lucide-react'
import Image from 'next/image'
import { formatTimeAgo } from '@/app/feed/page'

interface PostCommentSectionProps {
  postId: string
  currentUserId: string
  postAuthorId: string
  language: 'en' | 'es'
  isExpanded: boolean
}

const INITIAL_DISPLAY = 3
const COMMENTS_PER_LOAD = 20

export default function PostCommentSection({
  postId,
  currentUserId,
  postAuthorId,
  language,
  isExpanded,
}: PostCommentSectionProps) {
  const supabase = createClient()
  const [comments, setComments] = useState<PostCommentWithAuthor[]>([])
  const [loading, setLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const t = {
    en: {
      noComments: 'No comments yet — be the first!',
      viewAll: (count: number) => `View all ${count} comments`,
      addComment: 'Add a comment...',
      send: 'Send',
      delete: 'Delete',
      error: 'Error loading comments',
    },
    es: {
      noComments: '¡Sin comentarios aún — sé el primero!',
      viewAll: (count: number) => `Ver todos los ${count} comentarios`,
      addComment: 'Añade un comentario...',
      send: 'Enviar',
      delete: 'Eliminar',
      error: 'Error al cargar comentarios',
    },
  }

  const strings = t[language] || t.en

  // Load comments when section is expanded
  useEffect(() => {
    if (!isExpanded) return

    const loadComments = async () => {
      setLoading(true)
      try {
        const result = await fetchPostComments(supabase, postId, COMMENTS_PER_LOAD)
        if (result.success && result.data) {
          setComments(result.data)
        }
      } catch (error) {
        console.error('Error loading comments:', error)
      } finally {
        setLoading(false)
      }
    }

    loadComments()
  }, [isExpanded, postId, supabase])

  const handleAddComment = async () => {
    if (!newComment.trim() || submitting) return

    setSubmitting(true)
    try {
      const result = await insertPostComment(supabase, {
        post_id: postId,
        author_id: currentUserId,
        content: newComment,
      })

      if (result.success) {
        // Optimistically add the comment to the list
        const optimisticComment: PostCommentWithAuthor = {
          id: Math.random().toString(36), // Temporary ID
          post_id: postId,
          author_id: currentUserId,
          content: newComment,
          created_at: new Date().toISOString(),
          author: null, // Will be filled from current session context
        }

        setComments([...comments, optimisticComment])
        setNewComment('')

        // Optionally refetch to get the actual data
        const refreshResult = await fetchPostComments(supabase, postId, COMMENTS_PER_LOAD)
        if (refreshResult.success && refreshResult.data) {
          setComments(refreshResult.data)
        }
      }
    } catch (error) {
      console.error('Error adding comment:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const result = await deletePostComment(supabase, commentId)
      if (result.success) {
        setComments(comments.filter((c) => c.id !== commentId))
      }
    } catch (error) {
      console.error('Error deleting comment:', error)
    }
  }

  if (!isExpanded) return null

  const displayedComments = showAll ? comments : comments.slice(0, INITIAL_DISPLAY)
  const totalComments = comments.length

  return (
    <div className="mt-4 pt-4 border-t border-stone-200 dark:border-gray-700">
      {/* View all link */}
      {totalComments > INITIAL_DISPLAY && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mb-3 text-sm font-semibold text-tribe-green hover:underline"
        >
          {strings.viewAll(totalComments)}
        </button>
      )}

      {/* Comments list */}
      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {loading && totalComments === 0 ? (
          <p className="text-sm text-theme-secondary">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
        ) : displayedComments.length === 0 ? (
          <p className="text-sm text-theme-secondary italic">{strings.noComments}</p>
        ) : (
          displayedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              postAuthorId={postAuthorId}
              language={language}
              onDelete={handleDeleteComment}
            />
          ))
        )}
      </div>

      {/* Comment input */}
      <div className="flex gap-3 items-end">
        <textarea
          ref={inputRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={strings.addComment}
          className="flex-1 bg-stone-50 dark:bg-[#3D4349] border border-stone-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-theme-primary placeholder-theme-secondary resize-none max-h-20"
          rows={2}
        />
        <button
          onClick={handleAddComment}
          disabled={!newComment.trim() || submitting}
          className="flex items-center gap-2 bg-tribe-green text-slate-900 rounded-lg px-4 py-2 font-semibold hover:bg-[#8FD642] disabled:opacity-50 transition"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

interface CommentItemProps {
  comment: PostCommentWithAuthor
  currentUserId: string
  postAuthorId: string
  language: 'en' | 'es'
  onDelete: (commentId: string) => void
}

function CommentItem({ comment, currentUserId, postAuthorId, language, onDelete }: CommentItemProps) {
  const isOwnComment = comment.author_id === currentUserId
  const isPostAuthor = currentUserId === postAuthorId
  const canDelete = isOwnComment || isPostAuthor

  return (
    <div className="flex gap-2">
      {comment.author?.avatar_url && (
        <Image
          src={comment.author.avatar_url}
          alt={comment.author.name}
          width={32}
          height={32}
          className="h-8 w-8 rounded-full object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1">
        <div className="bg-stone-100 dark:bg-[#3D4349] rounded-lg px-3 py-2">
          <p className="text-sm font-semibold text-theme-primary">{comment.author?.name || 'User'}</p>
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
              {language === 'es' ? 'Eliminar' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
