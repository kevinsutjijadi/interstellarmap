import { InterstellarViewDynamic } from "@/components/canvas/InterstellarViewDynamic";
import styles from "./ui.module.css";

export default function Home() {
  return (
    <main className={styles.mainRoot}>
      <InterstellarViewDynamic />
    </main>
  );
}
