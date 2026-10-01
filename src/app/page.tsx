import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const STEPS = [
  { title: "Collect for yourself", body: "Import your own exports. Files are read in your browser." },
  { title: "Understand", body: "See the intents your data reveals — and exactly why." },
  { title: "Decide", body: "Correct, delete or lock any category. Nothing is shared without you." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-6 py-24">
      <div className="space-y-6">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">IntentBank</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          See the commercial profile hiding inside your own data.
        </h1>
        <p className="text-lg text-muted-foreground">They ask. You decide.</p>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Open your IntentBank
        </Link>
      </div>
      <ol className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="space-y-1">
            <p className="text-sm text-muted-foreground">{i + 1}</p>
            <p className="font-medium">{s.title}</p>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
