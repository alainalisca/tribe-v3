/**
 * GET   /api/products/order/[id] — Order details (auth: buyer or instructor)
 * PATCH /api/products/order/[id] — Mark order as fulfilled (auth: instructor)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { fulfillOrder } from '@/lib/dal/products';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: order, error } = await supabase.from('product_orders').select('*').eq('id', id).single();

    if (error || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Only the buyer or instructor can view the order
    if (order.buyer_id !== user.id && order.instructor_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Not authorized to view this order' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/order/[id]', action: 'get_order' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch order to check instructor ownership
    const { data: order, error: fetchError } = await supabase.from('product_orders').select('*').eq('id', id).single();

    if (fetchError || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.instructor_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Only the seller can fulfill orders' }, { status: 403 });
    }

    if (order.fulfillment_status === 'completed') {
      return NextResponse.json({ success: false, error: 'Order is already fulfilled' }, { status: 400 });
    }

    const { error } = await fulfillOrder(supabase, id, user.id);

    if (error) {
      logError(error, { route: '/api/products/order/[id]', action: 'fulfill_order' });
      return NextResponse.json({ success: false, error: 'Failed to fulfill order' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Order fulfilled' });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/order/[id]', action: 'fulfill_order' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
