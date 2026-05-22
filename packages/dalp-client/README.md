# @dalp-examples/dalp-client

A thin, typed wrapper around the DALP HTTP API used by all example apps in this
repo.

This package intentionally stays small — it shows the _shape_ of how a frontend
should talk to DALP. In production code you would import the real
`@dalp/api-contract` (oRPC) once it is published.

## Usage

```tsx
import { DalpProvider, useDalp } from "@dalp-examples/dalp-client/react";

function App() {
  return (
    <DalpProvider
      url={import.meta.env.VITE_DALP_API_URL}
      apiKey={import.meta.env.VITE_DALP_API_KEY}
    >
      <Whoami />
    </DalpProvider>
  );
}

function Whoami() {
  const dalp = useDalp();
  // pair with @tanstack/react-query for caching
  // const { data } = useQuery({ queryKey: ["whoami"], queryFn: dalp.whoami });
  return null;
}
```
