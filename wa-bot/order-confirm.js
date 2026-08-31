// Sends interactive WA order confirmation with Yes / No list buttons
// and handles the customer's response

// Map of orderId -> { jid, brand, orderNumber }
const pendingConfirmations = new Map();

/**
 * Send the interactive confirmation listMessage to a customer.
 * @param {object} sock  - Baileys socket (passed in to avoid circular dep)
 * @param {object} order - Shopify order object
 * @param {object} brand - Brand model doc
 */
async function sendOrderConfirmation(sock, order, brand) {
  if (!sock) {
    console.log('[order-confirm] No sock passed — skipping confirmation');
    return;
  }

  // Build customer JID from phone
  const rawPhone = order.shipping_address?.phone || order.phone || order.billing_address?.phone || '';
  const phone = rawPhone.replace(/\D/g, '').replace(/^0+/, '');
  if (!phone) {
    console.log(`[order-confirm] No phone for order #${order.order_number} — skipping`);
    return;
  }

  // Prefer Indian numbers — prepend 91 if not present
  const normalized = phone.startsWith('91') ? phone : `91${phone}`;
  const jid = `${normalized}@s.whatsapp.net`;

  const isCOD = order.payment_gateway === 'Cash on Delivery' ||
    (order.payment_gateway || '').toLowerCase().includes('cod') ||
    order.financial_status === 'pending';

  // Build item list string
  const items = (order.line_items || [])
    .map(i => `${i.name} × ${i.quantity}`)
    .join(', ');

  const total = `₹${parseFloat(order.total_price || 0).toFixed(2)}`;
  const city = order.shipping_address?.city || '';
  const state = order.shipping_address?.province || '';
  const brandName = (brand.name || 'Store').toUpperCase();

  const bodyText =
    `■ ${brandName} ■\n` +
    `CONFIRM YOUR ORDER\n` +
    `${'─'.repeat(28)}\n` +
    `ORDER  :  #${order.order_number}\n` +
    `ITEMS  :  ${items}\n` +
    `TOTAL  :  ${total}\n` +
    `${'─'.repeat(28)}\n` +
    `SHIP TO :  ${city}${state ? ', ' + state : ''}`;

  const msg = {
    text:
      `🛍️ *Order Confirmation Required*\n\n` +
      `■ ${brandName} ■\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `ORDER   :  #${order.order_number}\n` +
      `ITEMS   :  ${items}\n` +
      `TOTAL   :  ${total}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `SHIP TO :  ${city}${state ? ', ' + state : ''}\n\n` +
      `Reply *Y* to confirm ✅\n` +
      `Reply *N* to cancel ❌`,
  };

  try {
    await sock.sendMessage(jid, msg);
    console.log(`[order-confirm] Sent confirmation to ${jid} for order #${order.order_number}`);

    // Store pending so handleConfirmationResponse can act on it
    pendingConfirmations.set(String(order.id), {
      jid,
      brand,
      orderNumber: order.order_number,
      isCOD,
    });

    // Auto-expire after 24h
    setTimeout(() => pendingConfirmations.delete(String(order.id)), 24 * 60 * 60 * 1000);
  } catch (e) {
    console.error('[order-confirm] Failed to send:', e.message);
  }
}

/**
 * Call this from handleMessage when a text reply arrives.
 * Checks if the jid has a pending confirmation and the reply is Y/N.
 * Returns true if handled.
 */
async function handleConfirmationResponse(sock, jid, text) {
  const reply = text.trim().toLowerCase();
  if (reply !== 'y' && reply !== 'n') return false;

  // Find the pending confirmation for this jid
  let orderId = null;
  for (const [id, p] of pendingConfirmations.entries()) {
    if (p.jid === jid) { orderId = id; break; }
  }
  if (!orderId) return false;

  const pending = pendingConfirmations.get(orderId);

  if (reply === 'y') {
    await sock.sendMessage(jid, {
      text: `🎉 Order *#${pending.orderNumber}* confirmed!\n\nWill be dispatched within *24–48 hrs*. You'll get a tracking link here once shipped. 📦`,
    });
    console.log(`[order-confirm] Confirmed order #${pending.orderNumber}`);
  } else {
    await sock.sendMessage(jid, {
      text: `Your order *#${pending.orderNumber}* has been cancelled. If this was a mistake, place a new order or contact us. 🙏`,
    });
    console.log(`[order-confirm] Cancelled order #${pending.orderNumber}`);
  }

  pendingConfirmations.delete(orderId);
  return true;
}

module.exports = { sendOrderConfirmation, handleConfirmationResponse };
