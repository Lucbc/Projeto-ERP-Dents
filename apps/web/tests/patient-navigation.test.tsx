import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { PatientNavigationGuard } from '../src/components/patient-navigation-guard';

let router: ReturnType<typeof createMemoryRouter>;
afterEach(()=>{cleanup();router?.dispose();});
function mount(pending=false, uncertain=false) {
  router=createMemoryRouter([
    {path:'/',element:<p>Dashboard destination</p>},
    {path:'/patients',element:<><input defaultValue="Fictitious draft" /><Link to="/">Dashboard link</Link>
      <PatientNavigationGuard when pending={pending} uncertain={uncertain} /></>},
    {path:'/next',element:<p>Forward destination</p>},
  ],{initialEntries:['/','/patients','/next'],initialIndex:1});
  return render(<RouterProvider router={router} />);
}
it('keeps a draft on declined back/link navigation and follows accepted forward navigation',async()=>{
  mount();
  await act(async()=>{await router.navigate(-1);});
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/patients');
  fireEvent.click(screen.getByText('Continuar preenchendo'));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Fictitious draft');
  fireEvent.click(screen.getByText('Dashboard link'));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('alertdialog'),{key:'Escape'});
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await act(async()=>{await router.navigate(1);});
  fireEvent.click(screen.getByText('Descartar e sair'));
  expect(await screen.findByText('Forward destination')).toBeTruthy();
});
it('prevents departure during pending writes and clears the guard when its owner unmounts',async()=>{
  const view=mount(true);
  await act(async()=>{await router.navigate(-1);});
  expect((screen.getByText('Descartar e sair') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Aguarde a operação/)).toBeTruthy();
  view.unmount();
  expect(router.state.blockers.size).toBe(0);
});
it('explains that leaving does not cancel an unconfirmed creation',async()=>{
  mount(false,true);
  await act(async()=>{await router.navigate(-1);});
  expect(screen.getByText(/Confira a tentativa ao voltar/)).toBeTruthy();
  fireEvent.click(screen.getByText('Descartar e sair'));
  expect(await screen.findByText('Dashboard destination')).toBeTruthy();
});
