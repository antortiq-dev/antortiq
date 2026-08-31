// Sends interactive WA order confirmation with Yes / No list buttons
// and handles the customer's response

const { botState } = require('./index');

// Map of orderId -> { jid, brand, orderNumber, financial_status }
// Kept in memory — survives for the session; fine for same-day confirmations
const pendingConfirmations = new Map();

/**
 * Send the interactive confirmation listMessage to a customer.
 * @param {object} order   - Shopify order object
 * @param {object} brand   - Brand model doc
 */
async function sendOrderConfirmation(order, brand) {
  const sock = botState.sock;
  if (!sock || botState.status !== 'connected') {
    console.log('[order-confirm] WA not connected — skipping confirmation');
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
    listMessage: {
      title: 'Order Confirmation Required',
      text: bodyText,
      footerText: brand.name || 'Your Store',
      buttonText: 'Select Option',
      listType: 1,
      sections: [
        {
          title: 'Choose an action',
          rows: [
            {
              title: '✅  Yes, Confirm Order',
              description: 'Your order will be dispatched within 24–48 hrs',
              rowId: `confirm_yes_${order.id}`,
            },
            {
              title: '❌  No, Cancel Order',
              description: 'Your order will be cancelled',
              rowId: `confirm_no_${order.id}`,
            },
          ],
        },
      ],
    },
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
 * Call this from handleMessage when a listResponseMessage arrives.
 * Returns true if the message was handled as a confirmation response.
 */
async function handleConfirmationResponse(sock, msg) {
  const rowId = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId || '';
  if (!rowId) return false;

  const isYes = rowId.startsWith('confirm_yes_');
  const isNo  = rowId.startsWith('confirm_no_');
  if (!isYes && !isNo) return false;

  const orderId = rowId.replace('confirm_yes_', '').replace('confirm_no_', '');
  const pending = pendingConfirmations.get(orderId);
  const jid = msg.key.remoteJid;

  if (isYes) {
    await sock.sendMessage(jid, {
      text: `🎉 Order *#${pending?.orderNumber || ''}* confirmed!\n\nIt will be dispatched within *24–48 hrs*. You'll receive a tracking link here once shipped. 📦`,
    });
    console.log(`[order-confirm] Customer confirmed order #${pending?.orderNumber}`);
  } else {
    await sock.sendMessage(jid, {
      text: `Your order *#${pending?.orderNumber || ''}* has been cancelled. If this was a mistake, please place a new order or contact us. 🙏`,
    });
    console.log(`[order-confirm] Customer cancelled order #${pending?.orderNumber}`);
  }

  if (pending) pendingConfirmations.delete(orderId);
  return true;
}

module.exports = { sendOrderConfirmation, handleConfirmationResponse };
