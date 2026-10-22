import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { Navigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api";
import { authService } from "@/lib/services";
import { useAuth } from "@/hooks/use-auth";
import { recoverLogin } from "@/lib/login-recovery";
import { getSession, type SessionSnapshot } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Senha obrigatória."),
});

const bootstrapSchema = z
  .object({
    activationToken: z.string().trim().min(1, "Informe o código de ativação do servidor."),
    name: z.string().min(2, "Nome obrigatório."),
    email: z.string().email("Informe um e-mail válido."),
    password: z.string().refine((value) => Array.from(value).length >= 8, "Mínimo de 8 caracteres.").refine((value) => Array.from(value).length <= 128, "Maximo de 128 caracteres."),
    confirmPassword: z.string().refine((value) => Array.from(value).length >= 8, "Confirmação obrigatória.").refine((value) => Array.from(value).length <= 128, "Maximo de 128 caracteres."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type LoginForm = z.infer<typeof loginSchema>;
type BootstrapForm = z.infer<typeof bootstrapSchema>;

export function LoginPage() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [bootstrapFinished, setBootstrapFinished] = useState(false);
  const [uncertainLogin, setUncertainLogin] = useState<{ email: string; session: SessionSnapshot } | null>(null);
  const recoveryMutation = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: async () => {
      if (!uncertainLogin) return;
      return recoverLogin(uncertainLogin.email, uncertainLogin.session);
    },
    onSuccess: (result) => {
      if (result === 'absent') toast('Nenhum acesso confirmado. Clique em Entrar para tentar novamente.', 'error');
      if (result === 'different') toast('Há uma sessão de outra conta. Confira seu e-mail e clique em Entrar para acessar com sua conta.', 'error');
      if (result === 'changed') toast('A sessão mudou em outra aba. Recarregue a página e confira a conta antes de continuar.', 'error');
    },
    onError: (error) => toast(getApiErrorMessage(error), 'error'),
  });
  const offline = () => {
    if (navigator.onLine) return false;
    toast('Sem conexão. Nada foi enfileirado. Quando a conexão voltar, clique novamente para tentar.', 'error');
    return true;
  };

  const needsBootstrapQuery = useQuery({
    queryKey: ["auth", "needs-bootstrap"],
    queryFn: authService.needsBootstrap,
    enabled: !user,
  });

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const bootstrapForm = useForm<BootstrapForm>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: { activationToken: "", name: "", email: "", password: "", confirmPassword: "" },
  });
  const needsBootstrap = !bootstrapFinished && Boolean(needsBootstrapQuery.data?.needsBootstrap);

  const loginMutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (values: LoginForm) => {
      setUncertainLogin(null);
      const session = getSession();
      try {
        await login(values.email, values.password);
      } catch (error) {
        if (axios.isAxiosError(error) && !error.response && !axios.isCancel(error)) {
          setUncertainLogin({ email: values.email, session });
        }
        throw error;
      }
    },
    onError: (error) => {
      toast(getApiErrorMessage(error), "error");
    },
  });

  const bootstrapMutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (values: BootstrapForm) => {
      await authService.bootstrapAdmin({
        name: values.name,
        email: values.email,
        password: values.password,
      }, values.activationToken);
    },
    onSuccess: async (_result, values) => {
      setBootstrapFinished(true);
      bootstrapForm.reset();
      loginForm.setValue("email", values.email);
      await needsBootstrapQuery.refetch();
      try {
        await login(values.email, values.password);
      } catch {
        toast("Administrador criado. Faça login para continuar.", "error");
      }
    },
    onError: (error) => {
      toast(getApiErrorMessage(error), "error");
      void needsBootstrapQuery.refetch();
    },
  });

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className={needsBootstrap
        ? "grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2" : "w-full max-w-md"}>
        <Card className="border-cyan-100 bg-white/95">
          <h1 className="font-display text-2xl font-semibold text-slate-800">ERP Dents</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso ao sistema da clínica odontológica.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={loginForm.handleSubmit((values) => {
              if (!loginMutation.isPending && !recoveryMutation.isPending && !offline()) loginMutation.mutate(values);
            })}
          >
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail</label>
              <Input type="email" disabled={loginMutation.isPending || recoveryMutation.isPending}
                {...loginForm.register("email", { onChange: () => setUncertainLogin(null) })} />
              {loginForm.formState.errors.email && (
                <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Senha</label>
              <Input type="password" disabled={loginMutation.isPending || recoveryMutation.isPending} {...loginForm.register("password")} />
              {loginForm.formState.errors.password && (
                <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loginMutation.isPending || recoveryMutation.isPending}>
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {uncertainLogin && <div role="alert" className="mt-5 space-y-2 text-sm text-slate-600">
            <p>Não foi possível confirmar o login. Quando a conexão voltar, confira se o acesso foi concluído. Sua senha não será reenviada nessa conferência.</p>
            <Button type="button" variant="outline" disabled={recoveryMutation.isPending || loginMutation.isPending}
              onClick={() => { if (!offline()) recoveryMutation.mutate(); }}>
              {recoveryMutation.isPending ? 'Conferindo acesso...' : 'Conferir acesso'}
            </Button>
          </div>}

          {needsBootstrapQuery.isError && (
            <div role="alert" className="mt-5 space-y-2 text-sm text-slate-600">
              <p>Não foi possível consultar a configuração do servidor.</p>
              <Button type="button" variant="outline" onClick={() => void needsBootstrapQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
        </Card>

        {needsBootstrap && <Card className="border-teal-100 bg-white/95">
          <h2 className="font-display text-xl font-semibold text-slate-800">
            Criar administrador inicial
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Para começar, informe o código de ativação gerado no servidor e cadastre o responsável pela clínica.
          </p>

            <form
              aria-label="Configuração inicial"
              className="mt-6 space-y-4"
              onSubmit={bootstrapForm.handleSubmit((values) => {
                if (!bootstrapMutation.isPending && !offline()) bootstrapMutation.mutate(values);
              })}
            >
              <div>
                <label htmlFor="activation-token" className="mb-1 block text-sm font-semibold text-slate-700">Código de ativação</label>
                <Input id="activation-token" type="password" autoComplete="off" {...bootstrapForm.register("activationToken")} />
                <p className="mt-1 text-xs text-slate-500">Solicite o código à pessoa que preparou o servidor. Ele é usado apenas nesta configuração inicial.</p>
                {bootstrapForm.formState.errors.activationToken && <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.activationToken.message}</p>}
              </div>
              <div>
                <label htmlFor="bootstrap-name" className="mb-1 block text-sm font-semibold text-slate-700">Nome</label>
                <Input id="bootstrap-name" {...bootstrapForm.register("name")} />
                {bootstrapForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="bootstrap-email" className="mb-1 block text-sm font-semibold text-slate-700">E-mail</label>
                <Input id="bootstrap-email" type="email" {...bootstrapForm.register("email")} />
                {bootstrapForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="bootstrap-password" className="mb-1 block text-sm font-semibold text-slate-700">Senha</label>
                <Input id="bootstrap-password" type="password" autoComplete="new-password" {...bootstrapForm.register("password")} />
                {bootstrapForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="bootstrap-confirm" className="mb-1 block text-sm font-semibold text-slate-700">Confirmar senha</label>
                <Input id="bootstrap-confirm" type="password" autoComplete="new-password" {...bootstrapForm.register("confirmPassword")} />
                {bootstrapForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600">
                    {bootstrapForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={bootstrapMutation.isPending}>
                {bootstrapMutation.isPending ? "Criando..." : "Criar administrador"}
              </Button>
            </form>
        </Card>}
      </div>
    </div>
  );
}
