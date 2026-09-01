// Demo WA message templates — wrapped in ``` for monospace alignment on WhatsApp

const F = '```';

const TRACK_SHIPPED = `${F}
▪ A N T O R T I Q ▪
█████████░░░░░ 60%
SHIPPED
────────────────
ORDER  #3037

●───●───◉───○───○
CNF PCK SHP OFD DLV

COURIER  BlueDart
AWB      80146005251

TRACK  https://dashboard.croscrow.com/o/3037
────────────────
NOTHING NEEDED FROM YOU
${F}`;

const TRACK_TRANSIT = `${F}
▪ A N T O R T I Q ▪
██████████░░░░ 70%
IN TRANSIT
────────────────
ORDER  #3037

●───●───●───○───○
CNF PCK SHP OFD DLV

STATE  On the road and moving
       your way.

TRACK  https://dashboard.croscrow.com/o/3037
────────────────
60+ BRANDS | ANTORTIQ.COM
${F}`;

const TRACK_OFD = `${F}
▪ A N T O R T I Q ▪
█████████████░ 90%
OUT FOR DELIVERY
────────────────
ORDER  #3037

●───●───●───◉───○
CNF PCK SHP OFD DLV

TRACK  https://dashboard.croscrow.com/o/3037
────────────────
KEEP   ₹2634 READY
${F}`;

const TRACK_DELIVERED = `${F}
▪ A N T O R T I Q ▪
██████████████ 100%
DELIVERED
────────────────
ORDER  #3037

●───●───●───●───●
CNF PCK SHP OFD DLV
────────────────
POST YOUR FIT ─ TAG US
@antortiq.official
BEST FITS WIN FREE MERCH
60+ BRANDS | ANTORTIQ.COM
${F}`;

const RETURN_EXCHANGE = `${F}
▪ A N T O R T I Q ▪
RETURN / EXCHANGE
███████░░░░░░░ 50%
PICKUP SCHEDULED
────────────────
ORDER  #2864

●───●───◉───○───○
REQ APR PCK QC DONE

COURIER  Delhivery
AWB      49892110001050

PACK   Original tags and
       packaging. Photo or
       clip while you pack.

TRACK  https://dashboard.croscrow.com/returns?o=2864&contact=na
────────────────
KEEP THE PACK READY
${F}`;

const ORDER_CONFIRM = `${F}
▪ A N T O R T I Q ▪
ORDER CONFIRMED ✅
────────────────
ORDER   #3037
ITEMS   Oversized Tee - Black - L × 1
TOTAL   ₹1,835.00
────────────────
SHIP TO  Mumbai, Maharashtra

Reply Y to confirm ✅
Reply N to cancel ❌
${F}`;

// Map service keywords to demo sequences
function getDemoMessages(serviceHint) {
  const h = (serviceHint || '').toLowerCase();
  if (/return|exchange|rto|refund/.test(h))    return [RETURN_EXCHANGE];
  if (/confirm|cod|order confirm/.test(h))     return [ORDER_CONFIRM];
  if (/track|shipping|deliver|update/.test(h)) return [TRACK_SHIPPED, TRACK_OFD, TRACK_DELIVERED];
  // default: full tracking sequence
  return [TRACK_SHIPPED, TRACK_OFD, TRACK_DELIVERED];
}

module.exports = { getDemoMessages, TRACK_SHIPPED, TRACK_TRANSIT, TRACK_OFD, TRACK_DELIVERED, RETURN_EXCHANGE, ORDER_CONFIRM };
