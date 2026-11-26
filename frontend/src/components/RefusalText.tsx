interface RefusalTextProps {
  message: string;
  /** Files the refusal names, one per line under the message. */
  names?: readonly string[];
}

export function RefusalText({ message, names = [] }: RefusalTextProps) {
  return (
    <>
      <span>{message}</span>
      {names.map((name, index) => (
        <span key={`${index}-${name}`} className="mt-1 block font-semibold">
          {name}
        </span>
      ))}
    </>
  );
}
