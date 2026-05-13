import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { Overview } from "../../src/app/pages/instance/Overview";

export function renderOverviewForPath(initialPath: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/instance/:id" element={<Overview />} />
      </Routes>
    </MemoryRouter>
  );
}
