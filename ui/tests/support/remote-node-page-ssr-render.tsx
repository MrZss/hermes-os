import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { Environment } from "../../src/app/pages/instance/Environment";
import { Deployment } from "../../src/app/pages/instance/Deployment";
import { Diagnostics } from "../../src/app/pages/instance/Diagnostics";

export function renderRemoteNodePage(pathname: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/instance/:id/environment" element={<Environment />} />
        <Route path="/instance/:id/deployment" element={<Deployment />} />
        <Route path="/instance/:id/diagnostics" element={<Diagnostics />} />
      </Routes>
    </MemoryRouter>
  );
}
