/** DAL: session_templates table */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';

type TemplateInsert = Database['public']['Tables']['session_templates']['Insert'];

export async function insertTemplate(supabase: SupabaseClient, data: TemplateInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_templates').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertTemplate' });
    return { success: false, error: 'Failed to save template' };
  }
}

export async function fetchTemplatesByUser(supabase: SupabaseClient, userId: string): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('session_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchTemplatesByUser' });
    return { success: false, error: 'Failed to fetch templates' };
  }
}

export async function deleteTemplate(supabase: SupabaseClient, templateId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_templates').delete().eq('id', templateId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteTemplate' });
    return { success: false, error: 'Failed to delete template' };
  }
}
