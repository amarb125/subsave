import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ButtonLink';
import { SubscriptionForm } from '@/components/SubscriptionForm';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { emptyFormValues, formToDraft, subscriptionToFormValues } from '@/lib/forms';
import type { SubscriptionFormValues } from '@/lib/schema';

export function NewSubscription() {
  const { loading, loadError, reload, settings, today, addSubscription } = useData();
  const navigate = useNavigate();
  const toast = useToast();

  // Built once settings are loaded so the currency and reminder defaults are the user's own.
  const initial = useMemo(() => emptyFormValues(settings ?? undefined, today), [settings, today]);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;

  const submit = async (values: SubscriptionFormValues) => {
    const created = await addSubscription(formToDraft(values));
    if (created) {
      toast.success(`${created.name} added`);
      navigate(`/subscriptions/${created.id}`);
    }
  };

  return (
    <>
      <PageHeader title="Add a subscription" subtitle="Enter it by hand. SubSave never connects to your bank." />
      <SubscriptionForm initial={initial} submitLabel="Save subscription" onSubmit={submit} onCancel={() => navigate(-1)} />
    </>
  );
}

export function EditSubscription() {
  const { id } = useParams();
  const { subscriptions, loading, loadError, reload, editSubscription } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const sub = subscriptions.find((s) => s.id === id);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!sub) {
    return (
      <EmptyState
        title="Subscription not found"
        description="It may have been deleted."
        action={<ButtonLink to="/subscriptions">Back to subscriptions</ButtonLink>}
      />
    );
  }

  const submit = async (values: SubscriptionFormValues) => {
    const updated = await editSubscription(sub.id, formToDraft(values, sub));
    if (updated) {
      toast.success('Changes saved');
      navigate(`/subscriptions/${sub.id}`);
    }
  };

  return (
    <>
      <PageHeader title={`Edit ${sub.name}`} />
      <SubscriptionForm
        key={sub.id}
        initial={subscriptionToFormValues(sub)}
        base={sub}
        submitLabel="Save changes"
        onSubmit={submit}
        onCancel={() => navigate(`/subscriptions/${sub.id}`)}
      />
    </>
  );
}
