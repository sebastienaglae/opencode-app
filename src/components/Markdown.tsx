import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { isFilePath, openFileInViewer } from "../core/navigation";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="oc-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Fenced code is wrapped in <pre><code>; render it with Shiki.
          pre: (props: any) => {
            const child = (Array.isArray(props.children) ? props.children[0] : props.children) as
              | { props?: { className?: string; children?: unknown } }
              | undefined;
            const className: string = child?.props?.className ?? "";
            const raw = String(child?.props?.children ?? "").replace(/\n$/, "");
            const lang = /language-([\w-]+)/.exec(className)?.[1];
            return <CodeBlock code={raw} lang={lang} />;
          },
          code: (props: any) => {
            const text = String(props.children ?? "");
            // Inline code that looks like a project file path becomes clickable.
            if (!props.className && isFilePath(text)) {
              return (
                <code
                  className="cursor-pointer"
                  style={{ textDecoration: "underline", textDecorationStyle: "dotted" }}
                  onClick={() => openFileInViewer(text)}
                >
                  {props.children}
                </code>
              );
            }
            return <code className={props.className}>{props.children}</code>;
          },
          a: (props: any) => {
            const href: string = props.href ?? "";
            if (isFilePath(href)) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    openFileInViewer(href);
                  }}
                >
                  {props.children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {props.children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
