import type { SensitiveCategorySlug } from "@/lib/taxonomy";

// PRD §7: sensitive signals are never stored. This runs in the browser before upload and again on
// the server. It is deliberately over-inclusive — a false positive costs one dropped signal, a
// false negative stores something the user never agreed to keep.

interface Rule {
  domains: string[]; // registrable domains (or suffixes) — matched against the signal's domain
  text: RegExp[]; // matched against title, search query and URL path
}

const w = (words: string): RegExp => new RegExp(`\\b(?:${words})\\b`, "i");

const RULES: Record<SensitiveCategorySlug, Rule> = {
  health: {
    domains: [
      "webmd.com", "mayoclinic.org", "healthline.com", "medlineplus.gov", "nih.gov", "cdc.gov",
      "clevelandclinic.org", "drugs.com", "goodrx.com", "zocdoc.com", "teladoc.com", "betterhelp.com",
      "talkspace.com", "hims.com", "forhers.com", "ro.co", "mychart.com", "psychologytoday.com",
      "verywellhealth.com", "medicalnewstoday.com", "patient.info", "nhs.uk",
      "plannedparenthood.org", "23andme.com",
    ],
    text: [
      w("symptoms?|diagnos\\w*|disease|disorder|syndrome|cancer|tumou?r|chemo\\w*|diabet\\w*|insulin|hiv|aids|std|sti|herpes|hepatitis"),
      w("depress\\w*|anxiety|adhd|autism|bipolar|schizo\\w*|ptsd|suicid\\w*|self[- ]harm|therap(?:y|ist)|psychiatr\\w*|counsel+ing"),
      w("pregnan\\w*|prenatal|postnatal|maternity|fertility|ivf|miscarriage|abortion|contracepti\\w*|birth control|ovulation"),
      w("prescription|pharmacy|dosage|side effects|medication|antidepressant\\w*|opioid\\w*|rehab|addiction|overdose"),
      w("doctor|clinic|hospital|surgery|surgeon|oncolog\\w*|cardiolog\\w*|dermatolog\\w*|urolog\\w*|gyn(?:a|e)colog\\w*"),
      w("weight loss|ozempic|wegovy|semaglutide|erectile|viagra|cialis"),
    ],
  },
  finance: {
    domains: [
      "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com", "usbank.com",
      "pnc.com", "ally.com", "discover.com", "americanexpress.com", "schwab.com", "fidelity.com",
      "vanguard.com", "robinhood.com", "coinbase.com", "creditkarma.com", "experian.com", "equifax.com",
      "transunion.com", "annualcreditreport.com", "nerdwallet.com", "mint.com", "turbotax.com",
      "irs.gov", "paypal.com", "venmo.com", "sofi.com", "lendingclub.com", "chime.com", "wise.com",
    ],
    text: [
      w("bankrupt\\w*|foreclos\\w*|debt|collections? agency|payday|loan|mortgage|refinanc\\w*|credit score|credit report"),
      w("overdraft|garnish\\w*|repossess\\w*|eviction|unemployment|food stamps|snap benefits|welfare|irs|tax return|salary|income"),
      w("401k|ira|brokerage|bank account|routing number|net worth|crypto wallet"),
    ],
  },
  politics: {
    domains: [
      "democrats.org", "gop.com", "actblue.com", "winred.com", "vote.org", "ballotpedia.org",
      "fec.gov", "dnc.org", "rnc.org", "moveon.org", "heritage.org", "aclu.org",
    ],
    text: [
      w("democrat\\w*|republican\\w*|gop|liberal\\w*|conservative\\w*|progressive\\w*|maga|libertarian\\w*"),
      w("election|ballot|vote|voting|voter|campaign donat\\w*|senator|congress\\w*|caucus|primary election|political party|protest|rally"),
    ],
  },
  religion: {
    domains: ["biblegateway.com", "bible.com", "quran.com", "chabad.org", "lds.org", "churchofjesuschrist.org", "jw.org"],
    text: [
      w("church|mosque|synagogue|temple|bible|quran|koran|torah|prayer|pray|sermon|mass times|scripture|baptism|ramadan|passover|diwali|sabbath"),
      w("christian\\w*|catholic\\w*|muslim\\w*|islam\\w*|jewish|judaism|hindu\\w*|buddhis\\w*|mormon\\w*|atheis\\w*|evangelical\\w*"),
    ],
  },
  sexuality: {
    domains: [
      "pornhub.com", "xvideos.com", "xnxx.com", "onlyfans.com", "chaturbate.com", "grindr.com",
      "tinder.com", "bumble.com", "hinge.co", "okcupid.com", "match.com", "her.app", "feeld.co", "adultfriendfinder.com",
    ],
    text: [
      w("porn\\w*|xxx|nsfw|sex|sexual\\w*|nude\\w*|erotic\\w*|fetish\\w*|escort\\w*|hookup\\w*|onlyfans"),
      w("gay|lesbian|bisexual|transgender|queer|lgbt\\w*|coming out|sexual orientation|dating app"),
    ],
  },
  children: {
    domains: ["classdojo.com", "schoology.com", "powerschool.com", "brightwheel.com", "seesaw.me", "remind.com"],
    text: [w("my (?:son|daughter|kid|kids|child|children|toddler|baby)|pediatric\\w*|custody|child support|daycare|school pickup|report card")],
  },
  precise_location: {
    domains: ["life360.com", "findmy.apple.com", "whitepages.com", "spokeo.com", "beenverified.com"],
    text: [
      /\/maps\/(?:dir|place)\//i,
      /\b\d{1,5}\s+\w+(?:\s\w+)?\s(?:st|street|ave|avenue|rd|road|blvd|ln|lane|dr|drive|ct|court|way)\b/i,
      w("directions to|my location|home address"),
    ],
  },
  private_communications: {
    domains: [
      "mail.google.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com", "proton.me",
      "protonmail.com", "messenger.com", "whatsapp.com", "telegram.org", "signal.org", "slack.com",
      "discord.com", "zoom.us", "teams.microsoft.com", "icloud.com",
    ],
    text: [/\/(?:mail|inbox|messages|direct|dm|chat)(?:\/|$)/i],
  },
};

// Matching for private_communications needs the full host (mail.google.com, not google.com).
export function sensitiveCategory(input: {
  domain?: string | null;
  host?: string | null;
  title?: string | null;
  query?: string | null;
  url?: string | null;
}): SensitiveCategorySlug | null {
  const domain = input.domain?.toLowerCase() ?? "";
  const host = input.host?.toLowerCase() ?? domain;
  let path = "";
  if (input.url) {
    try {
      path = new URL(input.url).pathname;
    } catch {
      /* not a URL */
    }
  }
  const text = [input.title, input.query, path.replace(/[-_/]+/g, " ")].filter(Boolean).join(" \n ");

  for (const [slug, rule] of Object.entries(RULES) as [SensitiveCategorySlug, Rule][]) {
    if (rule.domains.some((d) => domain === d || host === d || host.endsWith(`.${d}`))) return slug;
    if (text && rule.text.some((re) => re.test(text))) return slug;
    if (path && rule.text.some((re) => re.source.startsWith("\\/") && re.test(path))) return slug;
  }
  return null;
}
