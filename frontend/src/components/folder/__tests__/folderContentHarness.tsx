import type { ComponentProps } from "react";

import { useFolderFilter } from "@/hooks/useFolderFilter";
import { FolderContent as Inner } from "../FolderContent";

/** `FolderContent` with the name filter wired as `FolderBrowser` wires it. */
export function FolderContent(props: Omit<ComponentProps<typeof Inner>, "filter">) {
  const filter = useFolderFilter(props.files, props.folders);
  return <Inner {...props} filter={filter} />;
}
