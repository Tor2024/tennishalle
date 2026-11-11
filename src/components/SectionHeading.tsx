import { Reveal } from './Reveal'

export function SectionHeading({ lead, script, trail, id }: { lead: string; script?: string; trail?: string; id?: string }) {
  return (
    <Reveal className="max-w-xl" as="h2">
      <span id={id} className="ro-h1 block">
        {lead}
        {script && <span className="font-script text-primary-500"> {script}</span>}
        {trail && <span> {trail}</span>}
      </span>
    </Reveal>
  )
}
