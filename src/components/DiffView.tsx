export function DiffView({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  return (
    <div className="oc-diff">
      {lines.map((line, i) => {
        let cls = "";
        if (line.startsWith("@@")) cls = "hunk";
        else if (line.startsWith("+++") || line.startsWith("---")) cls = "";
        else if (line.startsWith("+")) cls = "add";
        else if (line.startsWith("-")) cls = "del";
        return (
          <div key={i} className={cls}>
            {line.length ? line : " "}
          </div>
        );
      })}
    </div>
  );
}
