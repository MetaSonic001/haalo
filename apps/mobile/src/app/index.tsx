import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";
import { config } from "@/lib/config";

export default function Index() {
  const { ready, session } = useSession();
  if (!ready) return null;
  return <Redirect href={session || config.demo ? "/(tabs)" : "/welcome"} />;
}
