"""
seed-demo.py — Import Croscrow SQLite orders → Antortiq MongoDB
Run: python3 scripts/seed-demo.py
Requires: pymongo (pip3 install pymongo)
"""
import sqlite3, random, os, sys, math
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from pymongo import MongoClient, DESCENDING
except ImportError:
    sys.exit("Install pymongo first: pip3 install pymongo")

try:
    from dotenv import dotenv_values
    env = dotenv_values(Path(__file__).parent.parent / ".env")
except ImportError:
    import subprocess; subprocess.check_call([sys.executable,"-m","pip","install","python-dotenv","-q"])
    from dotenv import dotenv_values
    env = dotenv_values(Path(__file__).parent.parent / ".env")

MONGO_URI = env.get("MONGO_URI") or os.environ.get("MONGO_URI")
if not MONGO_URI:
    sys.exit("MONGO_URI not found in .env")

SQLITE_PATH = Path.home() / "Desktop/jarvis-shopify-backup-2026-07-29/croscrow.db"
if not SQLITE_PATH.exists():
    sys.exit(f"SQLite not found at {SQLITE_PATH}")

VENDORS = [
    {"name":"DRIP STUDIOS","pct":25,"weight":26},
    {"name":"SICOS",       "pct":30,"weight":19},
    {"name":"FLYJONE",     "pct":26,"weight":16},
    {"name":"Odd Affair",  "pct":20,"weight":14},
    {"name":"2WENT6EX",    "pct":28,"weight":12},
    {"name":"AHEGAS",      "pct":20,"weight":8 },
    {"name":"BOOZEE",      "pct":20,"weight":5 },
]

PRODUCTS = [
    "Oversized Acid Wash Tee","Cargo Utility Shorts","Box-Fit Hoodie","Relaxed Chinos",
    "Patchwork Denim Jacket","Ribbed Tank Top","Y2K Track Pants","Crewneck Sweatshirt",
    "Washed Baggy Jeans","Graphic Print Tee","Fleece Zip-Up Hoodie","Wide-Leg Cord Trousers",
    "Tie-Dye Camp Shirt","Knit Polo","Distressed Denim Shorts","Drop-Shoulder Bomber",
    "Mesh Jersey Top","Vintage Wash Joggers","Linen Button-Down Shirt","Nylon Wind Jacket",
    "Raw Hem Flare Jeans","French Terry Shorts","Varsity Jacket","Ribbed Crop Top",
    "Twill Worker Jacket","Quarter-Zip Pullover","Pleated Trousers","Shacket Overshirt",
    "Thermal Henley","Printed Bucket Hat",
]

CUSTOMERS = [
    ("Rahul Sharma","9876543210"),("Priya Verma","9123456789"),("Amit Singh","9988776655"),
    ("Sneha Gupta","8765432109"),("Rohit Patel","9654321098"),("Anjali Nair","8543210987"),
    ("Vikram Mehta","9432109876"),("Pooja Joshi","8321098765"),("Arun Kumar","9210987654"),
    ("Divya Shah","8109876543"),("Karan Malhotra","9001234567"),("Simran Kaur","8890123456"),
    ("Nikhil Rao","9789012345"),("Meera Pillai","8678901234"),("Akash Yadav","9567890123"),
    ("Riya Kapoor","8456789012"),("Deepak Bose","9345678901"),("Nisha Sinha","8234567890"),
    ("Suresh Reddy","9123456780"),("Kavya Menon","8012345679"),("Arjun Desai","9901234568"),
    ("Shreya Dubey","8890123457"),("Manish Thakur","9779012346"),("Ananya Chauhan","8668901235"),
    ("Siddharth Jain","9557890124"),("Pallavi Mishra","8446789013"),("Tarun Saxena","9335678902"),
    ("Ritu Aggarwal","8224567891"),("Gaurav Tiwari","9113456780"),("Priyanka Bajaj","8002345679"),
]

COURIERS   = ["Delhivery","Ekart","Xpressbees","Shadowfax","DTDC","Bluedart","Ecom Express"]
PRICE_OPTS = [599,699,799,899,999,1199,1299,1499,1699,1799,1999,2199,2499,2799,2999]
DISPATCHED = {"ready","pickup","transit","ofd","delivered","rto"}


def pick_weighted(lst):
    total = sum(v["weight"] for v in lst)
    r = random.random() * total
    for v in lst:
        r -= v["weight"]
        if r <= 0:
            return v
    return lst[-1]


def gen_awb():
    prefix = random.choice(["DL","XB","SF","EK","DD","BD"])
    return f"{prefix}{random.randint(1000000000,9999999999)}"


def gen_dates(count):
    now = datetime.now(timezone.utc)
    dates = []
    for _ in range(count):
        u = random.random()
        days_ago = int(-math.log(max(1 - u * 0.9, 1e-9)) * 22)
        days_ago = min(days_ago, 120)
        d = now - timedelta(days=days_ago,
                            hours=random.randint(0,23),
                            minutes=random.randint(0,59))
        dates.append(d)
    dates.sort(reverse=True)
    return dates


def main():
    print("[seed] Connecting to MongoDB…")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client.get_default_database()
    col = db["demoorders"]

    existing = col.count_documents({})
    if existing:
        print(f"[seed] Clearing {existing} existing demo orders…")
        col.delete_many({})

    print("[seed] Reading SQLite…")
    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM order_meta ORDER BY shopify_id ASC").fetchall()
    settle_map = {}
    for r in conn.execute("SELECT * FROM settlement_orders").fetchall():
        settle_map[r["shopify_order_id"]] = dict(r)
    conn.close()

    print(f"[seed] Processing {len(rows)} orders…")
    dates = gen_dates(len(rows))
    base_num = 1001
    docs = []

    for i, row in enumerate(rows):
        row = dict(row)
        settled = settle_map.get(row["shopify_id"])
        vendor = pick_weighted(VENDORS)
        customer_name, customer_phone = random.choice(CUSTOMERS)
        created_at = dates[i]
        updated_at = created_at + timedelta(days=random.randint(1,7))
        stage = row["stage"]
        payment_type = row["payment_type"] or "cod"

        my_revenue   = settled["my_revenue"]  if settled else random.choice(PRICE_OPTS)
        commission   = settled["commission_pct"] if settled else vendor["pct"]

        is_dispatched = stage in DISPATCHED
        awb     = row["awb"] or (gen_awb() if is_dispatched else "")
        courier = row["courier"] or (random.choice(COURIERS) if is_dispatched else "")

        docs.append({
            "shopifyId":     row["shopify_id"],
            "orderName":     settled["order_name"] if settled else f"#{base_num+i}",
            "stage":         stage,
            "paymentType":   payment_type,
            "advancePaid":   row["advance_paid"] or 0,
            "myRevenue":     float(my_revenue),
            "vendorName":    vendor["name"],
            "commissionPct": float(commission),
            "awb":           awb,
            "courier":       courier,
            "productName":   random.choice(PRODUCTS),
            "customerName":  customer_name,
            "customerPhone": customer_phone,
            "createdAt":     created_at,
            "updatedAt":     updated_at,
        })

    BATCH = 100
    for i in range(0, len(docs), BATCH):
        col.insert_many(docs[i:i+BATCH])
        print(f"\r[seed] Inserted {min(i+BATCH, len(docs))}/{len(docs)}", end="", flush=True)
    print("\n[seed] Creating indexes…")
    col.create_index([("createdAt", DESCENDING)])
    col.create_index([("stage", 1), ("createdAt", DESCENDING)])
    col.create_index([("vendorName", 1), ("createdAt", DESCENDING)])
    col.create_index("shopifyId")

    print("[seed] Done ✓\n\nStage breakdown:")
    for doc in col.aggregate([{"$group":{"_id":"$stage","count":{"$sum":1},"rev":{"$sum":"$myRevenue"}}},{"$sort":{"count":-1}}]):
        print(f"  {doc['_id']:12} {doc['count']:4} orders  ₹{int(doc['rev']):,}")

    client.close()

if __name__ == "__main__":
    main()
