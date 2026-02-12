import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Senha obrigatória."),
});

const bootstrapSchema = z
  .object({
    name: z.string().min(2, "Nome obrigatório."),
    email: z.string().email("Informe um e-mail válido."),
    password: z.string().min(8, "Mínimo de 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirmação obrigatória."),
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
  const [showBootstrap, setShowBootstrap] = useState(false);

  const needsBootstrapQuery = useQuery({
    queryKey: ["auth", "needs-bootstrap"],
    queryFn: authService.needsBootstrap,
  });

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const bootstrapForm = useForm<BootstrapForm>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (needsBootstrapQuery.data?.needsBootstrap) {
      setShowBootstrap(true);
    }
  }, [needsBootstrapQuery.data?.needsBootstrap]);

  const loginMutation = useMutation({
    mutationFn: async (values: LoginForm) => {
      await login(values.email, values.password);
    },
    onError: (error) => {
      toast(getApiErrorMessage(error), "error");
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: async (values: BootstrapForm) => {
      await authService.bootstrapAdmin({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      await login(values.email, values.password);
    },
    onSuccess: () => {
      toast("Admin inicial criado com sucesso.");
    },
    onError: (error) => {
      toast(getApiErrorMessage(error), "error");
    },
  });

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-5xl grid-cols-1 gap-6 lg:grid lg:grid-cols-2">
        <Card className="border-cyan-100 bg-white/95">
          <h1 className="font-display text-2xl font-semibold text-slate-800">ERP Dents</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso ao sistema da clínica odontológica.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={loginForm.handleSubmit((values) => loginMutation.mutate(values))}
          >
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail</label>
              <Input type="email" {...loginForm.register("email")} />
              {loginForm.formState.errors.email && (
                <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Senha</label>
              <Input type="password" {...loginForm.register("password")} />
              {loginForm.formState.errors.password && (
                <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {needsBootstrapQuery.data?.needsBootstrap && (
            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">
                Nenhum usuário encontrado. Crie o admin inicial para liberar o sistema.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                onClick={() => setShowBootstrap((prev) => !prev)}
              >
                {showBootstrap ? "Ocultar formulário" : "Criar admin inicial"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="border-teal-100 bg-white/95">
          <h2 className="font-display text-xl font-semibold text-slate-800">Criar admin inicial</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use apenas na primeira inicialização, quando o banco está vazio.
          </p>

          {showBootstrap ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={bootstrapForm.handleSubmit((values) => bootstrapMutation.mutate(values))}
            >
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Nome</label>
                <Input {...bootstrapForm.register("name")} />
                {bootstrapForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail</label>
                <Input type="email" {...bootstrapForm.register("email")} />
                {bootstrapForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Senha</label>
                <Input type="password" {...bootstrapForm.register("password")} />
                {bootstrapForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">{bootstrapForm.formState.errors.password.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Confirmar senha</label>
                <Input type="password" {...bootstrapForm.register("confirmPassword")} />
                {bootstrapForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600">
                    {bootstrapForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={bootstrapMutation.isPending}>
                {bootstrapMutation.isPending ? "Criando..." : "Criar admin"}
              </Button>
            </form>
          ) : (
            <p className="mt-6 text-sm text-slate-500">
              O formulário é habilitado automaticamente quando o endpoint
              <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">/api/auth/needs-bootstrap</code>
              retorna true.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
