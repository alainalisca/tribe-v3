'use client';

import { useParams } from 'next/navigation';
import SessionChat from '@/components/SessionChat';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    setSession(sessionData);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#3D4349] pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 bg-white dark:bg-[#2C3137] border-b border-gray-200 dark:border-gray-700 p-4 z-10">
          <div className="flex items-center gap-3">
            <Link href={`/session/${sessionId}`}>
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">{session?.sport} Chat</h1>
              <p className="text-sm text-gray-500">{session?.location}</p>
            </div>
          </div>
        </div>

        <SessionChat sessionId={sessionId} currentUserId={user.id} />
      </div>
    </div>
  );
}
