import React, { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "../src/components/ui/modal";
afterEach(cleanup);
function Example({ blocked = false }: { blocked?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Abrir</button>
    <Modal open={open} title="Exemplo" onClose={() => { if (!blocked) setOpen(false); }}>
      <input aria-label="Rascunho" /><button onClick={() => setOpen(false)}>Cancelar</button>
    </Modal></>;
}
it("names the dialog and restores a connected trigger after closing", () => {
  render(<Example />); const trigger=screen.getByText("Abrir");trigger.focus();fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Exemplo" }).hasAttribute("open")).toBe(true);
  const field=screen.getByLabelText("Rascunho");field.focus();fireEvent.click(screen.getByText("Cancelar"));
  expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(trigger);
});
it("keeps cancellation controlled by the latest caller guard", () => {
  const view=render(<Example blocked />);fireEvent.click(screen.getByText("Abrir"));
  const modal=screen.getByRole("dialog");const event=new Event("cancel", { cancelable:true });
  fireEvent(modal,event);expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Fechar janela"}));fireEvent.click(modal);
  expect(screen.getByRole("dialog")).toBeTruthy();
  view.rerender(<Example />);fireEvent(modal,new Event("cancel",{cancelable:true}));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("does not close when interacting with the contents", () => {
  render(<Example />);fireEvent.click(screen.getByText("Abrir"));
  fireEvent.click(screen.getByLabelText("Rascunho"));expect(screen.getByRole("dialog")).toBeTruthy();
});
