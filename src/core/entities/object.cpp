#include "object.h"

namespace tsstg
{
    DEFINE_CLASS_GUID_ANONYMOUS(ObjectWeakRef)
    class ObjectWeakRef : public virtual IWeakReference
    {
        IMPL_IUNKNOWN_DEFAULT();

    private:
        IUnknown* mRefSource;

    public:
        ObjectWeakRef(IUnknown* source) : mRefSource(source) {}

        void SetExpired()
        {
            mRefSource = nullptr;
        }

        bool Resolve(const GUID& guid, void** ppv) override
        {
            if (!mRefSource)
            {
                *ppv = nullptr;
                return false;
            }
            return mRefSource->QueryInterface(guid, ppv);
        }
    };

    Object::Object()
    {
        mWeakRef = new ObjectWeakRef(this);
    }

    Object::~Object()
    {
        mWeakRef.Cast<ObjectWeakRef>()->SetExpired();
    }

    bool Object::GetWeakReference(IWeakReference** ppv)
    {
        return mWeakRef.As(ppv);
    }
} // namespace tsstg