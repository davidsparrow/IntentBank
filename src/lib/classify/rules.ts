import type { CategorySlug } from "@/lib/taxonomy";

// Deterministic first pass of the hybrid classifier: obvious domains and keywords map straight to
// a commercial category. Anything left unclassified goes to Claude later (chunk 4).

type CommercialSlug = Exclude<
  CategorySlug,
  "health" | "precise_location" | "finance" | "politics" | "religion" | "sexuality" | "children" | "private_communications"
>;

const DOMAINS: Record<CommercialSlug, string[]> = {
  shopping: [
    "amazon.com", "ebay.com", "etsy.com", "target.com", "walmart.com", "costco.com", "kohls.com",
    "macys.com", "nordstrom.com", "zappos.com", "shein.com", "temu.com", "aliexpress.com", "rei.com",
    "nike.com", "adidas.com", "patagonia.com", "uniqlo.com", "gap.com", "sephora.com", "ulta.com",
    "wirecutter.com", "slickdeals.net", "honey.com", "rakuten.com", "shopify.com",
  ],
  travel: [
    "expedia.com", "booking.com", "airbnb.com", "vrbo.com", "kayak.com", "hotels.com", "tripadvisor.com",
    "skyscanner.com", "hopper.com", "priceline.com", "marriott.com", "hilton.com",
    "hyatt.com", "ihg.com", "delta.com", "united.com", "aa.com", "southwest.com", "alaskaair.com",
    "jetblue.com", "icelandair.com", "lonelyplanet.com", "ricksteves.com", "viator.com", "getyourguide.com",
    "seatguru.com", "thepointsguy.com", "amtrak.com", "hertz.com", "enterprise.com", "turo.com",
  ],
  automotive: [
    "tesla.com", "rivian.com", "lucidmotors.com", "edmunds.com", "cars.com", "carmax.com", "carvana.com",
    "autotrader.com", "kbb.com", "caranddriver.com", "motortrend.com", "truecar.com", "cargurus.com",
    "insideevs.com", "electrek.co", "toyota.com", "honda.com", "ford.com", "chevrolet.com", "bmwusa.com",
    "volvocars.com", "hyundaiusa.com", "kia.com", "subaru.com", "vw.com", "porsche.com", "autozone.com",
    "rockauto.com", "plugshare.com",
  ],
  home: [
    "homedepot.com", "lowes.com", "wayfair.com", "ikea.com", "crateandbarrel.com", "potterybarn.com",
    "westelm.com", "rh.com", "article.com", "houzz.com", "zillow.com", "redfin.com", "realtor.com",
    "ajmadison.com", "build.com", "ferguson.com", "thisoldhouse.com", "angi.com", "thumbtack.com",
    "casper.com", "saatva.com", "purple.com", "tuftandneedle.com", "bosch-home.com", "mieleusa.com",
    "subzero-wolf.com", "williams-sonoma.com",
  ],
  technology: [
    "apple.com", "bestbuy.com", "newegg.com", "bhphotovideo.com", "microcenter.com", "dell.com",
    "lenovo.com", "hp.com", "samsung.com", "framework.computer", "theverge.com", "rtings.com",
    "tomshardware.com", "anandtech.com", "arstechnica.com", "producthunt.com", "github.com",
    "stackoverflow.com", "anthropic.com", "openai.com", "cursor.com", "vercel.com", "supabase.com",
  ],
  entertainment: [
    "netflix.com", "hulu.com", "disneyplus.com", "max.com", "primevideo.com", "spotify.com",
    "steampowered.com", "epicgames.com", "nintendo.com", "playstation.com", "xbox.com", "ticketmaster.com",
    "stubhub.com", "seatgeek.com", "eventbrite.com", "imdb.com", "rottentomatoes.com", "letterboxd.com",
    "goodreads.com", "audible.com", "twitch.tv",
  ],
  food: [
    "doordash.com", "ubereats.com", "grubhub.com", "instacart.com", "allrecipes.com", "seriouseats.com",
    "bonappetit.com", "nytcooking.com", "foodnetwork.com", "opentable.com", "resy.com", "yelp.com",
    "hellofresh.com", "blueapron.com", "wholefoodsmarket.com", "traderjoes.com", "eater.com",
  ],
  education: [
    "coursera.org", "udemy.com", "edx.org", "khanacademy.org", "duolingo.com", "skillshare.com",
    "masterclass.com", "codecademy.com", "brilliant.org", "pluralsight.com", "frontendmasters.com",
  ],
  professional: [
    "linkedin.com", "indeed.com", "glassdoor.com", "levels.fyi", "wellfound.com", "ziprecruiter.com",
    "hbr.org", "g2.com", "capterra.com", "gartner.com", "salesforce.com", "hubspot.com",
  ],
};

const w = (words: string): RegExp => new RegExp(`\\b(?:${words})\\b`, "i");

// Ordered: first match wins, so more specific categories come before "shopping".
const KEYWORDS: [CommercialSlug, RegExp][] = [
  ["automotive", w("electric vehicle|ev charger|evs?|hybrid suv|sedan|suv|pickup truck|minivan|test drive|car lease|leasing|dealership|model [3ysx]|rivian|ioniq|mach-e|tire\\w*|horsepower|mpg")],
  ["travel", w("flights?|plane tickets?|train tickets?|airfare|hotels?|resort|itinerary|vacation|honeymoon|cruise|airbnb|passport|layover|things to do in|travel guide|road trip|all[- ]inclusive")],
  ["home", w("remodel\\w*|renovat\\w*|kitchen|bathroom|appliances?|induction|range hood|dishwasher|refrigerator|fridge|washer|dryer|sofa|couch|mattress|furniture|countertops?|cabinets?|flooring|roofing|hvac|heat pump|solar panels?|backyard|patio|garden\\w*|lawn|real estate|homes? for sale")],
  ["technology", w("laptops?|macbook|iphone|ipad|android|pixel|smartphone|monitor|gpu|graphics card|headphones|earbuds|airpods|keyboard|smart ?watch|tablet|router|nas|ssd|camera|drone|software|saas|api|llm|ai coding|vs ?code|programming")],
  ["entertainment", w("movies?|tv shows?|series|season \\d+|trailer|concert|tickets|festival|video games?|ps5|xbox|switch 2|playlist|podcast|novel|audiobook")],
  ["food", w("recipes?|restaurants?|cooking|meal prep|meal kit|groceries|grocery|cookbook|wine|coffee|espresso|bakery|brunch|dinner reservations?")],
  ["education", w("online course|courses?|bootcamp|certification|certificate program|degree|mba|tutorial|learn \\w+|class(?:es)?")],
  ["professional", w("jobs?|careers?|resume|cover letter|interview|hiring|recruit\\w*|conference|b2b|crm|consulting")],
  ["shopping", w("buy|deals?|coupons?|discount|sale|best \\w+ (?:for|under)|review|reviews|vs|price|cheap|gift ideas?|shoes|sneakers|jacket|dress|backpack")],
];

// Signals that look like active shopping, used by the intent engine as a strength boost.
export const COMMERCIAL_HINT = w("buy|price|deals?|coupon|discount|best|vs|versus|review|reviews|compare|comparison|near me|for sale|cost|quote|financing|lease");

export function ruleCategory(input: {
  domain?: string | null;
  url?: string | null;
  title?: string | null;
  query?: string | null;
}): CommercialSlug | null {
  const domain = input.domain?.toLowerCase();
  let byDomain: CommercialSlug | null = null;
  if (domain) {
    for (const [slug, domains] of Object.entries(DOMAINS) as [CommercialSlug, string[]][]) {
      if (domains.includes(domain)) {
        byDomain = slug;
        break;
      }
    }
  }
  if (input.url?.includes("google.com/travel")) byDomain = "travel";
  // A specialist domain is decisive; a general retailer defers to what was actually bought or searched.
  if (byDomain && byDomain !== "shopping") return byDomain;

  // Keywords only on deliberate text: search queries, purchase titles, page titles.
  const text = [input.query, input.title].filter(Boolean).join(" \n ");
  if (text) {
    for (const [slug, re] of KEYWORDS) if (re.test(text)) return byDomain && slug === "shopping" ? byDomain : slug;
  }
  return byDomain;
}
