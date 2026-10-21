import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

export function MemoryRouter({children, initialEntries=['/']}: PropsWithChildren<{initialEntries?: string[]}>) {
  const [router] = useState(() => createMemoryRouter([{path:'*',element:children}],{initialEntries}));
  useEffect(() => () => router.dispose(), [router]);
  return <RouterProvider router={router} />;
}
