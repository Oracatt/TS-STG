#include "object.h"

namespace tsstg
{
    DEFINE_CLASS_GUID_ANONYMOUS(ObjectWeakRef)
    class ObjectWeakRef : public virtual IWeakReference
    {
    private:
        IUnknown* mRefSource;
        std::atomic_uint32_t mRef;

    public:
        ObjectWeakRef(IUnknown* source) : mRefSource(source), mRef(0) {}

        void SetExpired()
        {
            mRefSource = nullptr;
        }

        uint32_t AddRef() override
        {
            return ++mRef;
        }

        uint32_t Release() override
        {
            uint32_t ref = --mRef;
            if (ref == 0)
            {
                delete this;
            }
            return ref;
        }

        bool QueryInterface(const GUID& guid, void** ppv) override
        {
            if (guid == GUID_OF(IUnknown))
            {
                this->AddRef();
                *ppv = static_cast<IUnknown*>(this);
                return true;
            }

            *ppv = nullptr;
            return false;
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

    Object::Object() : mWeakRef(new ObjectWeakRef(this)), mRef(0) {}

    Object::~Object()
    {
        mWeakRef.Cast<ObjectWeakRef>()->SetExpired();
    }

    uint32_t Object::AddRef()
    {
        return ++mRef;
    }

    uint32_t Object::Release()
    {
        uint32_t ref = --mRef;
        if (ref == 0)
        {
            delete this;
        }
        return ref;
    }

    bool Object::QueryInterface(const GUID& guid, void** ppv)
    {
        if (guid == GUID_OF(IUnknown))
        {
            this->AddRef();
            *ppv = static_cast<IUnknown*>(this);
            return true;
        }
        else if (guid == GUID_OF(IWeakReferenceSource))
        {
            this->AddRef();
            *ppv = static_cast<IWeakReferenceSource*>(this);
            return true;
        }

        *ppv = nullptr;
        return false;
    }

    bool Object::GetWeakReference(IWeakReference** ppv)
    {
        return mWeakRef.As(ppv);
    }
} // namespace tsstg