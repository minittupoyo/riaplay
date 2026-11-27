import type { JSX } from "solid-js";
import { enter } from "../motion";

export default function Page(props: { children: JSX.Element }) {
  return <div ref={(e) => enter(e, { y: 10 })}>{props.children}</div>;
}
