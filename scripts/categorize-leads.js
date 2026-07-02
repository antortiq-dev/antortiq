// Auto-categorize all leads based on name, handle, sector
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');
const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));

// Manual overrides — keyed by handle
const MANUAL = {
  // Food & Beverage
  'the1970shop':'Food & Beverage','smallbatch.co.in':'Food & Beverage','itsprolicious':'Food & Beverage',
  'opensecretsnacks':'Food & Beverage','getawaydesserts':'Food & Beverage','dohfulcookies':'Food & Beverage',
  'harvestsaladco':'Food & Beverage','baristacoffeecompany':'Food & Beverage','beanly':'Food & Beverage',
  'nomadpizzaofficial':'Food & Beverage','alpenliebe_india':'Food & Beverage','blackbazacoffee':'Food & Beverage',
  'cothas_coffee':'Food & Beverage','tobehonestfoods':'Food & Beverage','arakucoffeein':'Food & Beverage',
  'eattulua':'Food & Beverage','suchalisartisanbakehouse':'Food & Beverage','darkinschocolate':'Food & Beverage',
  'bombay.daak':'Food & Beverage','toffeecoffeeroasters':'Food & Beverage','eatopiaworld':'Food & Beverage',
  'hello_tempayy':'Food & Beverage','hajmolaindia':'Food & Beverage','roycechocolateindia':'Food & Beverage',
  'smthingsbrewing':'Food & Beverage','beyondwater.in':'Food & Beverage','7upuk':'Food & Beverage',
  'pistabarfimithai':'Food & Beverage','simplify.foods':'Food & Beverage','getphab':'Food & Beverage',

  // Health & Wellness
  'the_healthybinge':'Health & Wellness','originprotein':'Health & Wellness','bohecoindia':'Health & Wellness',
  'thefunclab':'Health & Wellness','decodeage':'Health & Wellness','fittr_one':'Health & Wellness',
  'svasthyaaorganics':'Health & Wellness','milldproteinatta':'Health & Wellness','nutrova':'Health & Wellness',
  'elevarsports_official':'Health & Wellness','qua.nutrition':'Health & Wellness','fuelledlifestyle':'Health & Wellness',
  'stroom.in':'Health & Wellness','get.outlive':'Health & Wellness','skore_india':'Beauty & Personal Care',

  // Bags & Accessories
  'laviesportworld':'Bags & Accessories','swissmilitaryindia':'Bags & Accessories','gear.bags':'Bags & Accessories',
  'mina.jaipur':'Bags & Accessories','hitchbybillie':'Bags & Accessories','uppercase_ecobags':'Bags & Accessories',
  'thetintedstory':'Bags & Accessories','thestruttstore':'Bags & Accessories','scarters.shop':'Bags & Accessories',
  'heliosindia':'Bags & Accessories',

  // Home & Lifestyle
  'embercookware':'Home & Lifestyle','popifyhomes':'Home & Lifestyle','letsrug.in':'Home & Lifestyle',
  'thedripco._rugs':'Home & Lifestyle','woodchopproducts':'Home & Lifestyle',

  // Art & Creative
  'strangestorein':'Art & Creative','esthreall':'Art & Creative','10hillsstudio':'Art & Creative',
  'atmosphere.in':'Art & Creative','gullylabs.tv':'Art & Creative','thebadpoetsclub':'Art & Creative',

  // Beauty & Personal Care
  'nuutjob':'Beauty & Personal Care',

  // Tech & Electronics
  'delluk':'Tech & Electronics','bpl.india':'Tech & Electronics','tclmobiletr':'Tech & Electronics',

  // Other
  'brevistay':'Travel & Other','sonypicturessg':'Media & Entertainment','sonypictures.nz':'Media & Entertainment',
  'adityab27':'Other','goudagamesindia':'Gaming & Toys',
};

// Keyword rules for anything not manually set
function autoCategory(lead) {
  const text = ((lead.name || '') + ' ' + (lead.handle || '') + ' ' + (lead.sector || '')).toLowerCase();

  if (/coffee|cafe|brew|cocoa|choco|cookie|snack|food|drink|beverage|dessert|pizza|salad|tea|water|juice|barista|bakery|bakehouse|bake|mitha|mithai|pistabarfi|ice cream|tempeh|protein atta/.test(text)) return 'Food & Beverage';
  if (/nutrition|protein|supplement|vitamin|wellness|health|fitness|organic|ayurved|nutrova|detox|superfood/.test(text)) return 'Health & Wellness';
  if (/bag|luggage|wallet|scarter|swiss military|gear|eyewear|sunglass|jewel|watch|accessory|strap/.test(text)) return 'Bags & Accessories';
  if (/rug|home|furniture|cookware|decor|interior|homedecor/.test(text)) return 'Home & Lifestyle';
  if (/art|gallery|creative|studio|drip co|gully|poet|music|media|publisher|film/.test(text)) return 'Art & Creative';
  if (/beauty|cosmetic|personal care|skin|grooming|skincare/.test(text)) return 'Beauty & Personal Care';
  if (/tech|electronics|computer|mobile|laptop|gadget|dell|bpl|tcl/.test(text)) return 'Tech & Electronics';
  if (/travel|hotel|stay/.test(text)) return 'Travel & Other';

  // Default remaining to Clothing & Apparel (majority are streetwear/fashion)
  return 'Clothing & Apparel';
}

let changed = 0;
leads.forEach(lead => {
  const cat = MANUAL[lead.handle] || autoCategory(lead);
  if (lead.category !== cat) { lead.category = cat; changed++; }
});

fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));

// Print summary
const cats = {};
leads.forEach(l => { cats[l.category] = (cats[l.category]||0)+1; });
console.log(`\nCategorized ${changed} leads.\n`);
Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log(`  ${n.toString().padStart(3)}  ${c}`));
